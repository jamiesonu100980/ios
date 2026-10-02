#!/usr/bin/env node
/**
 * iOS 设备网络健康监测脚本
 * 用途：监测 iOS 设备所处网络环境的安全健康状态
 * 适用：安全分析人员、企业 IT 管理员
 * 运行环境：Node.js 18+（在监控主机上运行，非 iOS 设备本体）
 * 使用方法：node ios_network_health_monitor.js
 */

const net = require("net");
const tls = require("tls");
const dns = require("dns");
const https = require("https");
const http = require("http");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// ============================================================
//  配置区
// ============================================================

const APPLE_CRITICAL_SERVICES = {
  "Apple Push (APNs)": {
    hosts: ["gateway.push.apple.com", "api.push.apple.com"],
    port: 443,
    description: "推送通知服务",
  },
  iCloud: {
    hosts: ["www.icloud.com", "setup.icloud.com"],
    port: 443,
    description: "iCloud 同步与备份",
  },
  "App Store": {
    hosts: ["apps.apple.com", "itunes.apple.com"],
    port: 443,
    description: "应用下载与更新",
  },
  "Software Update": {
    hosts: ["mesu.apple.com", "gdmf.apple.com", "updates.cdn-apple.com"],
    port: 443,
    description: "系统安全更新（关键）",
  },
  "Apple ID Auth": {
    hosts: ["appleid.apple.com", "idmsa.apple.com"],
    port: 443,
    description: "Apple ID 认证",
  },
  iMessage: {
    hosts: ["identity.ess.apple.com"],
    port: 443,
    description: "iMessage 密钥服务",
  },
  "OCSP / CRL": {
    hosts: ["ocsp.apple.com", "crl.apple.com"],
    port: 80,
    description: "证书吊销检查",
  },
  "Device Analytics": {
    hosts: ["xp.apple.com", "idiagnostics.apple.com"],
    port: 443,
    description: "设备诊断与分析",
  },
};

const DNS_TEST_DOMAINS = [
  "www.apple.com",
  "gateway.push.apple.com",
  "mesu.apple.com",
  "appleid.apple.com",
];

const DOH_SERVERS = {
  Cloudflare: "https://cloudflare-dns.com/dns-query?name={domain}&type=A",
  Google: "https://dns.google/resolve?name={domain}&type=A",
};

const SUSPICIOUS_PORTS = {
  8080: "HTTP 代理",
  8888: "常见代理/抓包工具 (Charles/Fiddler)",
  9090: "代理/管理端口",
  1080: "SOCKS 代理",
  3128: "Squid 代理",
  8443: "替代 HTTPS",
};

// ============================================================
//  工具函数
// ============================================================

const C = {
  ok: (t) => `\x1b[92m${t}\x1b[0m`,
  warn: (t) => `\x1b[93m${t}\x1b[0m`,
  fail: (t) => `\x1b[91m${t}\x1b[0m`,
  info: (t) => `\x1b[96m${t}\x1b[0m`,
  bold: (t) => `\x1b[1m${t}\x1b[0m`,
};

const PASS = C.ok("[PASS]");
const FAIL = C.fail("[FAIL]");
const WARN = C.warn("[WARN]");
const INFO = C.info("[INFO]");

function sectionHeader(title) {
  const line = "=".repeat(60);
  console.log(`\n${line}`);
  console.log(C.bold(`  ${title}`));
  console.log(line);
}

function timestamp() {
  return new Date().toISOString().replace("T", " ").replace(/\.\d+Z/, " UTC");
}

// ============================================================
//  检测模块
// ============================================================

function checkTcpConnect(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = new net.Socket();
    sock.setTimeout(timeout);
    sock.on("connect", () => {
      const latency = Date.now() - start;
      sock.destroy();
      resolve({ ok: true, latency_ms: latency });
    });
    sock.on("timeout", () => {
      sock.destroy();
      resolve({ ok: false, error: "timeout", latency_ms: -1 });
    });
    sock.on("error", (err) => {
      sock.destroy();
      resolve({ ok: false, error: err.message, latency_ms: -1 });
    });
    sock.connect(port, host);
  });
}

function checkTlsCertificate(host, port = 443, timeout = 5000) {
  return new Promise((resolve) => {
    const result = {
      ok: false,
      subject: null,
      issuer: null,
      not_after: null,
      days_remaining: null,
      protocol: null,
      cipher: null,
      warnings: [],
    };

    const sock = tls.connect(
      { host, port, servername: host, timeout, rejectUnauthorized: true },
      () => {
        const cert = sock.getPeerCertificate();
        const cipher = sock.getCipher();
        const protocol = sock.getProtocol();

        result.ok = true;
        result.subject = cert.subject?.CN || "N/A";
        result.issuer = cert.issuer?.O || cert.issuer?.CN || "N/A";
        result.protocol = protocol;
        result.cipher = cipher?.name || "unknown";

        if (cert.valid_to) {
          const notAfter = new Date(cert.valid_to);
          result.not_after = notAfter.toISOString().split("T")[0];
          result.days_remaining = Math.floor(
            (notAfter - new Date()) / 86400000
          );
          if (result.days_remaining < 30) {
            result.warnings.push(
              `证书将在 ${result.days_remaining} 天后过期`
            );
          }
        }

        if (["TLSv1", "TLSv1.1"].includes(protocol)) {
          result.warnings.push(`使用不安全的 TLS 版本: ${protocol}`);
        }

        const weakCiphers = ["RC4", "DES", "3DES", "MD5"];
        if (weakCiphers.some((w) => (result.cipher || "").toUpperCase().includes(w))) {
          result.warnings.push(`使用弱加密套件: ${result.cipher}`);
        }

        result.san = cert.subjectaltname
          ? cert.subjectaltname.split(", ").map((s) => s.replace("DNS:", ""))
          : [];

        sock.destroy();
        resolve(result);
      }
    );

    sock.on("error", (err) => {
      result.error = err.message;
      if (err.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
          err.code === "CERT_HAS_EXPIRED" ||
          err.code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
          err.code === "ERR_TLS_CERT_ALTNAME_INVALID" ||
          err.message.includes("certificate")) {
        result.warnings.push("可能存在中间人攻击 (MITM)");
      }
      sock.destroy();
      resolve(result);
    });

    sock.setTimeout(timeout, () => {
      result.error = "连接超时";
      sock.destroy();
      resolve(result);
    });
  });
}

function checkDnsResolution(domain) {
  return new Promise((resolve) => {
    const start = Date.now();
    dns.resolve4(domain, (err, addresses) => {
      const latency = Date.now() - start;
      if (err) {
        resolve({ ok: false, error: err.message, latency_ms: latency, ips: [] });
      } else {
        resolve({ ok: true, ips: addresses, latency_ms: latency });
      }
    });
  });
}

function fetchJson(url, timeout = 5000) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { Accept: "application/dns-json" },
      timeout,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

async function checkDnsConsistency(domain) {
  const local = await checkDnsResolution(domain);
  if (!local.ok) {
    return { ok: false, error: "本地 DNS 解析失败", domain, local_ips: [] };
  }

  const localIps = new Set(local.ips);
  const dohResults = {};
  const allDohIps = new Set();

  for (const [provider, urlTpl] of Object.entries(DOH_SERVERS)) {
    const url = urlTpl.replace("{domain}", domain);
    const data = await fetchJson(url);
    const ips = [];
    if (data?.Answer) {
      for (const ans of data.Answer) {
        if (ans.type === 1) ips.push(ans.data);
      }
    }
    dohResults[provider] = ips;
    ips.forEach((ip) => allDohIps.add(ip));
  }

  const overlap = [...localIps].filter((ip) => allDohIps.has(ip));
  const mismatch = overlap.length === 0 && allDohIps.size > 0;

  return {
    ok: !mismatch,
    domain,
    local_ips: local.ips,
    doh_ips: dohResults,
    mismatch,
  };
}

function checkPing(host, count = 4) {
  try {
    const isWin = process.platform === "win32";
    const cmd = isWin
      ? `ping -n ${count} -w 2000 ${host}`
      : `ping -c ${count} -W 2 ${host}`;
    const output = execSync(cmd, { timeout: 15000, encoding: "utf-8" });

    let packetLoss = -1;
    let avgLatency = -1;

    for (const line of output.split("\n")) {
      const lossMatch = line.match(/(\d+)%/);
      if (lossMatch) packetLoss = parseInt(lossMatch[1]);

      if (isWin) {
        const avgMatch = line.match(/Average\s*=\s*(\d+)ms/i);
        if (avgMatch) avgLatency = parseInt(avgMatch[1]);
        const avgMatchCN = line.match(/平均\s*=\s*(\d+)ms/i);
        if (avgMatchCN) avgLatency = parseInt(avgMatchCN[1]);
      } else {
        const avgMatch = line.match(/[\d.]+\/([\d.]+)\//);
        if (avgMatch) avgLatency = parseFloat(avgMatch[1]);
      }
    }

    return { ok: packetLoss < 100, packet_loss_pct: packetLoss, avg_latency_ms: avgLatency };
  } catch {
    return { ok: false, packet_loss_pct: 100, avg_latency_ms: -1 };
  }
}

function detectCaptivePortal() {
  return new Promise((resolve) => {
    const req = http.get("http://captive.apple.com/hotspot-detect.html", {
      headers: { "User-Agent": "CaptiveNetworkSupport/1.0" },
      timeout: 5000,
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        const hasSuccess = body.toLowerCase().includes("success");
        const isRedirected = res.headers.location &&
          !res.headers.location.includes("apple.com");
        const captive = !hasSuccess || isRedirected;
        resolve({
          ok: !captive,
          captive_detected: captive,
          status_code: res.statusCode,
          redirected_to: res.headers.location || null,
        });
      });
    });
    req.on("error", () => {
      resolve({ ok: false, captive_detected: true, error: "连接失败" });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, captive_detected: true, error: "超时" });
    });
  });
}

function scanLocalProxyPorts() {
  const checks = Object.entries(SUSPICIOUS_PORTS).map(([port, desc]) => {
    return new Promise((resolve) => {
      const sock = new net.Socket();
      sock.setTimeout(1000);
      sock.on("connect", () => {
        sock.destroy();
        resolve({ port: parseInt(port), description: desc, open: true });
      });
      sock.on("error", () => { sock.destroy(); resolve(null); });
      sock.on("timeout", () => { sock.destroy(); resolve(null); });
      sock.connect(parseInt(port), "127.0.0.1");
    });
  });

  return Promise.all(checks).then((results) => {
    const open = results.filter(Boolean);
    return { ok: open.length === 0, open_ports: open };
  });
}

function checkNetworkInterfaces() {
  try {
    const isWin = process.platform === "win32";
    const cmd = isWin ? "ipconfig /all" : "ifconfig";
    const output = execSync(cmd, { timeout: 10000, encoding: "utf-8" });
    const vpnKeywords = ["tun", "tap", "utun", "ppp", "ipsec", "wg", "wireguard"];
    const vpnDetected = vpnKeywords.some((kw) =>
      output.toLowerCase().includes(kw)
    );
    return { ok: true, vpn_detected: vpnDetected };
  } catch {
    return { ok: false, vpn_detected: false };
  }
}

// ============================================================
//  综合报告
// ============================================================

async function runFullScan() {
  const report = {
    scan_time: timestamp(),
    sections: {},
    score: 100,
    risk_level: "低",
    issues: [],
  };
  const deductions = [];

  // ------ 1. Apple 关键服务连通性 ------
  sectionHeader("1. Apple 关键服务连通性检测");
  const serviceResults = {};

  for (const [svcName, svcInfo] of Object.entries(APPLE_CRITICAL_SERVICES)) {
    let svcOk = false;
    for (const host of svcInfo.hosts) {
      const tcp = await checkTcpConnect(host, svcInfo.port);
      if (tcp.ok) {
        svcOk = true;
        console.log(
          `  ${PASS} ${svcName} (${host}:${svcInfo.port}) - ${tcp.latency_ms}ms - ${svcInfo.description}`
        );
        break;
      }
    }
    if (!svcOk) {
      console.log(
        `  ${FAIL} ${svcName} - 所有端点不可达 - ${svcInfo.description}`
      );
      report.issues.push(`关键服务不可达: ${svcName}`);
      deductions.push(svcName.includes("Update") || svcName.includes("Push") ? 10 : 5);
    }
    serviceResults[svcName] = svcOk;
  }
  report.sections.apple_services = serviceResults;

  // ------ 2. TLS 证书安全检测 ------
  sectionHeader("2. TLS 证书安全检测");
  const tlsHosts = [
    "www.apple.com",
    "appleid.apple.com",
    "mesu.apple.com",
    "gateway.push.apple.com",
    "www.icloud.com",
  ];
  const certResults = {};

  for (const host of tlsHosts) {
    const cert = await checkTlsCertificate(host);
    certResults[host] = cert;
    if (cert.ok) {
      let warnStr = "";
      if (cert.warnings.length) {
        warnStr = ` ${WARN} ${cert.warnings.join("; ")}`;
        cert.warnings.forEach((w) => {
          report.issues.push(`TLS 警告 (${host}): ${w}`);
          deductions.push(w.includes("MITM") ? 15 : 5);
        });
      }
      console.log(`  ${PASS} ${host}`);
      console.log(
        `        签发者: ${cert.issuer} | 协议: ${cert.protocol} | 套件: ${cert.cipher} | 有效期剩余: ${cert.days_remaining}天${warnStr}`
      );
    } else {
      const err = cert.error || "未知错误";
      console.log(`  ${FAIL} ${host} - ${err}`);
      cert.warnings.forEach((w) => console.log(`        ${WARN} ${w}`));
      report.issues.push(`TLS 证书异常 (${host}): ${err}`);
      deductions.push(20);
    }
  }
  report.sections.tls_certs = certResults;

  // ------ 3. DNS 安全检测 ------
  sectionHeader("3. DNS 解析安全检测");
  const dnsResults = {};

  for (const domain of DNS_TEST_DOMAINS) {
    const consistency = await checkDnsConsistency(domain);
    dnsResults[domain] = consistency;
    if (consistency.ok) {
      console.log(`  ${PASS} ${domain}`);
      console.log(`        本地解析: ${consistency.local_ips.slice(0, 3).join(", ")}`);
    } else if (consistency.mismatch) {
      console.log(`  ${FAIL} ${domain} - DNS 解析结果与公共 DoH 不一致（疑似 DNS 劫持）`);
      console.log(`        本地: ${JSON.stringify(consistency.local_ips)}`);
      console.log(`        DoH:  ${JSON.stringify(consistency.doh_ips)}`);
      report.issues.push(`DNS 解析异常 (${domain}): 本地与 DoH 结果不一致`);
      deductions.push(20);
    } else {
      console.log(`  ${FAIL} ${domain} - ${consistency.error || "解析失败"}`);
      report.issues.push(`DNS 解析失败: ${domain}`);
      deductions.push(10);
    }
  }
  report.sections.dns = dnsResults;

  // ------ 4. 网络延迟与丢包 ------
  sectionHeader("4. 网络延迟与丢包检测");
  const pingTargets = ["www.apple.com", "gateway.push.apple.com", "8.8.8.8"];
  const pingResults = {};

  for (const target of pingTargets) {
    const ping = checkPing(target);
    pingResults[target] = ping;
    const loss = ping.packet_loss_pct;
    const latency = ping.avg_latency_ms;

    if (ping.ok && loss <= 5) {
      console.log(`  ${PASS} ${target} - 延迟: ${latency}ms | 丢包: ${loss}%`);
    } else if (ping.ok && loss <= 20) {
      console.log(`  ${WARN} ${target} - 延迟: ${latency}ms | 丢包: ${loss}% (网络质量一般)`);
      deductions.push(3);
    } else {
      console.log(`  ${FAIL} ${target} - 延迟: ${latency}ms | 丢包: ${loss}%`);
      report.issues.push(`网络质量差 (${target}): 丢包 ${loss}%`);
      deductions.push(8);
    }
  }
  report.sections.ping = pingResults;

  // ------ 5. 强制门户检测 ------
  sectionHeader("5. 强制门户（Captive Portal）检测");
  const captive = await detectCaptivePortal();
  report.sections.captive_portal = captive;

  if (captive.ok) {
    console.log(`  ${PASS} 未检测到强制门户，网络出口正常`);
  } else {
    console.log(`  ${FAIL} 检测到强制门户或 HTTP 劫持`);
    if (captive.redirected_to) {
      console.log(`        ${WARN} 重定向至: ${captive.redirected_to}`);
    }
    report.issues.push("检测到强制门户/HTTP 劫持，可能处于恶意热点环境");
    deductions.push(25);
  }

  // ------ 6. 本地代理端口检测 ------
  sectionHeader("6. 本地代理 / 抓包工具端口检测");
  const proxy = await scanLocalProxyPorts();
  report.sections.proxy_ports = proxy;

  if (proxy.ok) {
    console.log(`  ${PASS} 未发现常见代理/抓包端口开启`);
  } else {
    proxy.open_ports.forEach((p) => {
      console.log(`  ${WARN} 端口 ${p.port} 开放 - ${p.description}`);
    });
    report.issues.push(`检测到 ${proxy.open_ports.length} 个可疑代理端口`);
    deductions.push(10);
  }

  // ------ 7. VPN / 网络接口检测 ------
  sectionHeader("7. 网络接口与 VPN 检测");
  const iface = checkNetworkInterfaces();
  report.sections.interfaces = iface;

  if (iface.vpn_detected) {
    console.log(`  ${INFO} 检测到 VPN/隧道接口（VPN 开启时部分检测结果可能受影响）`);
  } else {
    console.log(`  ${INFO} 未检测到 VPN 隧道接口`);
  }

  // ------ 评分 ------
  const totalDeduction = Math.min(deductions.reduce((a, b) => a + b, 0), 100);
  report.score = Math.max(0, 100 - totalDeduction);

  if (report.score >= 90) report.risk_level = "低";
  else if (report.score >= 70) report.risk_level = "中";
  else if (report.score >= 50) report.risk_level = "高";
  else report.risk_level = "极高";

  // ------ 汇总 ------
  sectionHeader("综合评估结果");

  const scoreColor =
    report.score >= 90 ? C.ok : report.score >= 70 ? C.warn : C.fail;

  console.log(`\n  网络健康评分: ${scoreColor(`${report.score}/100`)}`);
  console.log(`  风险等级:     ${scoreColor(report.risk_level)}`);
  console.log(`  扫描时间:     ${report.scan_time}`);
  console.log(`  发现问题:     ${report.issues.length} 项`);

  if (report.issues.length) {
    console.log(`\n  ${C.bold("问题清单:")}`);
    report.issues.forEach((issue, i) => {
      console.log(`    ${i + 1}. ${issue}`);
    });
  }

  console.log(`\n  ${C.bold("安全建议:")}`);
  if (report.score >= 90) {
    console.log("    - 当前网络环境健康，继续保持系统更新");
  } else {
    if (report.issues.some((i) => i.includes("MITM") || i.includes("证书"))) {
      console.log("    - [紧急] 检测到证书异常，立即断开当前网络，切换至可信网络");
      console.log("    - [紧急] 检查设备是否安装了未知根证书（设置 → 通用 → 关于本机 → 证书信任设置）");
    }
    if (report.issues.some((i) => i.includes("DNS"))) {
      console.log("    - 建议启用加密 DNS（DoH/DoT）或切换至可信 DNS（如 1.1.1.1 / 8.8.8.8）");
    }
    if (report.issues.some((i) => i.includes("强制门户") || i.includes("热点"))) {
      console.log("    - 当前可能处于恶意热点环境，避免传输敏感数据，建议使用 VPN");
    }
    if (report.issues.some((i) => i.includes("代理"))) {
      console.log("    - 检测到本地代理端口，确认是否为授权的调试/安全测试工具");
    }
    if (report.issues.some((i) => i.includes("不可达"))) {
      console.log("    - Apple 关键服务不可达可能导致安全更新无法下载，请检查网络或防火墙策略");
    }
    if (report.issues.some((i) => i.includes("丢包"))) {
      console.log("    - 网络质量不佳，可能影响安全更新推送的及时性");
    }
  }

  // ------ 保存报告 ------
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const reportPath = path.join(__dirname, `ios_network_health_${ts}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n  详细报告已保存: ${reportPath}`);
  console.log(`\n${"=".repeat(60)}\n`);

  return report;
}

// ============================================================
//  入口
// ============================================================

console.log(C.info(`
    ╔══════════════════════════════════════════════════╗
    ║   iOS 设备网络健康监测工具  v1.0                ║
    ║   用途：网络安全环境评估与威胁检测              ║
    ╚══════════════════════════════════════════════════╝
`));

runFullScan().catch(console.error);
