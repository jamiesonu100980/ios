#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
iOS 设备网络健康监测脚本
用途：监测 iOS 设备所处网络环境的安全健康状态
适用：安全分析人员、企业 IT 管理员
运行环境：Python 3.8+（在监控主机上运行，非 iOS 设备本体）
"""

import socket
import ssl
import subprocess
import time
import json
import hashlib
import sys
import os
import concurrent.futures
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from urllib.parse import urlparse

# ============================================================
#  配置区
# ============================================================

APPLE_CRITICAL_SERVICES = {
    "Apple Push (APNs)": {
        "hosts": ["gateway.push.apple.com", "api.push.apple.com"],
        "port": 443,
        "description": "推送通知服务"
    },
    "iCloud": {
        "hosts": ["www.icloud.com", "setup.icloud.com"],
        "port": 443,
        "description": "iCloud 同步与备份"
    },
    "App Store": {
        "hosts": ["apps.apple.com", "itunes.apple.com"],
        "port": 443,
        "description": "应用下载与更新"
    },
    "Software Update": {
        "hosts": ["mesu.apple.com", "gdmf.apple.com", "updates.cdn-apple.com"],
        "port": 443,
        "description": "系统安全更新（关键）"
    },
    "Apple ID Auth": {
        "hosts": ["appleid.apple.com", "idmsa.apple.com"],
        "port": 443,
        "description": "Apple ID 认证"
    },
    "iMessage": {
        "hosts": ["identity.ess.apple.com"],
        "port": 443,
        "description": "iMessage 密钥服务"
    },
    "Time Service": {
        "hosts": ["time.apple.com"],
        "port": 123,
        "description": "NTP 时间同步（证书验证依赖）"
    },
    "OCSP / CRL": {
        "hosts": ["ocsp.apple.com", "crl.apple.com"],
        "port": 80,
        "description": "证书吊销检查"
    },
    "Device Analytics": {
        "hosts": ["xp.apple.com", "idiagnostics.apple.com"],
        "port": 443,
        "description": "设备诊断与分析"
    }
}

KNOWN_APPLE_CERT_FINGERPRINTS = {}

DNS_TEST_DOMAINS = [
    "www.apple.com",
    "gateway.push.apple.com",
    "mesu.apple.com",
    "appleid.apple.com",
]

DOH_SERVERS = {
    "Cloudflare": "https://cloudflare-dns.com/dns-query?name={domain}&type=A",
    "Google": "https://dns.google/resolve?name={domain}&type=A",
    "Quad9": "https://dns.quad9.net:5053/dns-query?name={domain}&type=A",
}

SUSPICIOUS_PORTS = {
    8080: "HTTP 代理",
    8888: "常见代理/抓包工具 (Charles/Fiddler)",
    9090: "代理/管理端口",
    1080: "SOCKS 代理",
    3128: "Squid 代理",
    8443: "替代 HTTPS",
}

# ============================================================
#  工具函数
# ============================================================

class Colors:
    OK = "\033[92m"
    WARN = "\033[93m"
    FAIL = "\033[91m"
    INFO = "\033[96m"
    BOLD = "\033[1m"
    END = "\033[0m"

def colored(text, color):
    if sys.platform == "win32":
        os.system("")
    return f"{color}{text}{Colors.END}"

def timestamp():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

def status_icon(ok):
    return colored("[PASS]", Colors.OK) if ok else colored("[FAIL]", Colors.FAIL)

def warn_icon():
    return colored("[WARN]", Colors.WARN)

def info_icon():
    return colored("[INFO]", Colors.INFO)

def section_header(title):
    width = 60
    print(f"\n{'='*width}")
    print(colored(f"  {title}", Colors.BOLD))
    print(f"{'='*width}")

# ============================================================
#  检测模块
# ============================================================

def check_dns_resolution(domain, timeout=5):
    """检测 DNS 解析是否正常"""
    try:
        start = time.time()
        ips = socket.getaddrinfo(domain, None, socket.AF_UNSPEC)
        latency = (time.time() - start) * 1000
        unique_ips = list(set(addr[4][0] for addr in ips))
        return {"ok": True, "ips": unique_ips, "latency_ms": round(latency, 2)}
    except socket.gaierror as e:
        return {"ok": False, "error": str(e), "latency_ms": -1}

def check_tcp_connect(host, port, timeout=5):
    """检测 TCP 端口连通性"""
    try:
        start = time.time()
        sock = socket.create_connection((host, port), timeout=timeout)
        latency = (time.time() - start) * 1000
        sock.close()
        return {"ok": True, "latency_ms": round(latency, 2)}
    except (socket.timeout, socket.error, OSError) as e:
        return {"ok": False, "error": str(e), "latency_ms": -1}

def check_tls_certificate(host, port=443, timeout=5):
    """检测 TLS 证书有效性与安全参数"""
    result = {
        "ok": False,
        "subject": None,
        "issuer": None,
        "not_after": None,
        "days_remaining": None,
        "protocol": None,
        "cipher": None,
        "san": [],
        "warnings": []
    }
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, port), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
                cipher_info = ssock.cipher()
                result["protocol"] = ssock.version()
                result["cipher"] = cipher_info[0] if cipher_info else "unknown"

                subject = dict(x[0] for x in cert.get("subject", ()))
                issuer = dict(x[0] for x in cert.get("issuer", ()))
                result["subject"] = subject.get("commonName", "N/A")
                result["issuer"] = issuer.get("organizationName", "N/A")

                not_after_str = cert.get("notAfter", "")
                if not_after_str:
                    not_after = datetime.strptime(not_after_str, "%b %d %H:%M:%S %Y %Z")
                    result["not_after"] = not_after.strftime("%Y-%m-%d")
                    days_left = (not_after - datetime.utcnow()).days
                    result["days_remaining"] = days_left
                    if days_left < 30:
                        result["warnings"].append(f"证书将在 {days_left} 天后过期")

                san_list = []
                for type_val, value in cert.get("subjectAltName", ()):
                    if type_val == "DNS":
                        san_list.append(value)
                result["san"] = san_list

                if result["protocol"] in ("TLSv1", "TLSv1.1"):
                    result["warnings"].append(f"使用不安全的 TLS 版本: {result['protocol']}")

                known_weak = ("RC4", "DES", "3DES", "MD5")
                if any(w in (result["cipher"] or "").upper() for w in known_weak):
                    result["warnings"].append(f"使用弱加密套件: {result['cipher']}")

                result["ok"] = True
    except ssl.SSLCertVerificationError as e:
        result["error"] = f"证书验证失败: {e}"
        result["warnings"].append("可能存在中间人攻击 (MITM)")
    except Exception as e:
        result["error"] = str(e)
    return result

def check_dns_consistency(domain):
    """对比本地 DNS 与公共 DoH 的解析结果，检测 DNS 劫持"""
    local_result = check_dns_resolution(domain)
    if not local_result["ok"]:
        return {"ok": False, "error": "本地 DNS 解析失败", "domain": domain}

    local_ips = set(local_result["ips"])
    doh_results = {}
    all_doh_ips = set()

    for provider, url_tpl in DOH_SERVERS.items():
        try:
            url = url_tpl.format(domain=domain)
            req = Request(url, headers={"Accept": "application/dns-json"})
            with urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode())
                ips = []
                for answer in data.get("Answer", []):
                    if answer.get("type") in (1, 28):
                        ips.append(answer["data"])
                doh_results[provider] = ips
                all_doh_ips.update(ips)
        except Exception:
            doh_results[provider] = []

    overlap = local_ips & all_doh_ips
    mismatch = len(overlap) == 0 and len(all_doh_ips) > 0

    return {
        "ok": not mismatch,
        "domain": domain,
        "local_ips": list(local_ips),
        "doh_ips": {k: v for k, v in doh_results.items() if v},
        "mismatch": mismatch,
    }

def check_ping(host, count=4):
    """ICMP Ping 检测延迟与丢包"""
    try:
        if sys.platform == "win32":
            cmd = ["ping", "-n", str(count), "-w", "2000", host]
        else:
            cmd = ["ping", "-c", str(count), "-W", "2", host]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        output = result.stdout

        packet_loss = -1
        avg_latency = -1

        for line in output.splitlines():
            if "%" in line:
                parts = line.split("%")
                for p in parts[0].split():
                    try:
                        packet_loss = int(p.strip("(").strip(","))
                    except ValueError:
                        continue

            if sys.platform == "win32" and "Average" in line:
                try:
                    avg_latency = int(line.split("=")[-1].strip().replace("ms", ""))
                except ValueError:
                    pass
            elif "avg" in line:
                try:
                    avg_latency = float(line.split("/")[4])
                except (IndexError, ValueError):
                    pass

        return {
            "ok": result.returncode == 0,
            "packet_loss_pct": packet_loss,
            "avg_latency_ms": avg_latency,
        }
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return {"ok": False, "packet_loss_pct": 100, "avg_latency_ms": -1}

def detect_captive_portal():
    """检测强制门户（恶意热点常用手段）"""
    test_urls = [
        ("Apple", "http://captive.apple.com/hotspot-detect.html", "Success"),
        ("Google", "http://connectivitycheck.gstatic.com/generate_204", None),
    ]
    results = []
    for name, url, expected_body in test_urls:
        try:
            req = Request(url, headers={"User-Agent": "CaptiveNetworkSupport/1.0"})
            with urlopen(req, timeout=5) as resp:
                status = resp.status
                body = resp.read().decode("utf-8", errors="ignore")
                final_url = resp.url

                is_redirected = urlparse(final_url).netloc != urlparse(url).netloc
                if expected_body:
                    content_ok = expected_body.lower() in body.lower()
                else:
                    content_ok = status == 204

                results.append({
                    "provider": name,
                    "captive_detected": is_redirected or not content_ok,
                    "status_code": status,
                    "redirected_to": final_url if is_redirected else None,
                })
        except Exception as e:
            results.append({
                "provider": name,
                "captive_detected": True,
                "error": str(e),
            })

    any_captive = any(r["captive_detected"] for r in results)
    return {"ok": not any_captive, "details": results}

def scan_local_proxy_ports(target_ip="127.0.0.1"):
    """扫描本地常见代理/抓包端口"""
    open_ports = []
    for port, desc in SUSPICIOUS_PORTS.items():
        try:
            sock = socket.create_connection((target_ip, port), timeout=1)
            sock.close()
            open_ports.append({"port": port, "description": desc})
        except (socket.timeout, socket.error, OSError):
            pass
    return {"ok": len(open_ports) == 0, "open_ports": open_ports}

def check_network_interfaces():
    """获取本机网络接口信息（辅助判断 VPN / 多网卡环境）"""
    try:
        if sys.platform == "win32":
            cmd = ["ipconfig", "/all"]
        else:
            cmd = ["ifconfig"] if sys.platform == "darwin" else ["ip", "addr"]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        lines = result.stdout.splitlines()

        vpn_keywords = ["tun", "tap", "utun", "ppp", "ipsec", "wg", "wireguard"]
        vpn_detected = any(
            any(kw in line.lower() for kw in vpn_keywords)
            for line in lines
        )
        return {"ok": True, "vpn_detected": vpn_detected, "raw_lines": len(lines)}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ============================================================
#  综合报告生成
# ============================================================

def run_full_scan():
    """执行完整网络健康扫描"""
    report = {
        "scan_time": timestamp(),
        "sections": {},
        "score": 100,
        "risk_level": "低",
        "issues": [],
    }

    deductions = []

    # ------ 1. Apple 关键服务连通性 ------
    section_header("1. Apple 关键服务连通性检测")
    service_results = {}

    for svc_name, svc_info in APPLE_CRITICAL_SERVICES.items():
        svc_ok = False
        for host in svc_info["hosts"]:
            tcp = check_tcp_connect(host, svc_info["port"])
            if tcp["ok"]:
                svc_ok = True
                print(f"  {status_icon(True)} {svc_name} ({host}:{svc_info['port']}) "
                      f"- {tcp['latency_ms']}ms - {svc_info['description']}")
                break
        if not svc_ok:
            print(f"  {status_icon(False)} {svc_name} - 所有端点不可达 - {svc_info['description']}")
            report["issues"].append(f"关键服务不可达: {svc_name}")
            deductions.append(10 if "Update" in svc_name or "Push" in svc_name else 5)
        service_results[svc_name] = svc_ok

    report["sections"]["apple_services"] = service_results

    # ------ 2. TLS 证书安全检测 ------
    section_header("2. TLS 证书安全检测")
    cert_results = {}
    tls_hosts = [
        "www.apple.com", "appleid.apple.com", "mesu.apple.com",
        "gateway.push.apple.com", "www.icloud.com",
    ]

    for host in tls_hosts:
        cert = check_tls_certificate(host)
        cert_results[host] = cert
        if cert["ok"]:
            warn_str = ""
            if cert["warnings"]:
                warn_str = f" {warn_icon()} {'; '.join(cert['warnings'])}"
                for w in cert["warnings"]:
                    report["issues"].append(f"TLS 警告 ({host}): {w}")
                    deductions.append(15 if "MITM" in w else 5)
            print(f"  {status_icon(True)} {host}")
            print(f"        签发者: {cert['issuer']} | 协议: {cert['protocol']} | "
                  f"套件: {cert['cipher']} | 有效期剩余: {cert['days_remaining']}天{warn_str}")
        else:
            err = cert.get("error", "未知错误")
            print(f"  {status_icon(False)} {host} - {err}")
            for w in cert.get("warnings", []):
                print(f"        {warn_icon()} {w}")
            report["issues"].append(f"TLS 证书异常 ({host}): {err}")
            deductions.append(20)

    report["sections"]["tls_certs"] = {
        k: {"ok": v["ok"], "issuer": v.get("issuer"), "protocol": v.get("protocol"),
            "warnings": v.get("warnings", [])}
        for k, v in cert_results.items()
    }

    # ------ 3. DNS 安全检测 ------
    section_header("3. DNS 解析安全检测")
    dns_results = {}

    for domain in DNS_TEST_DOMAINS:
        consistency = check_dns_consistency(domain)
        dns_results[domain] = consistency
        if consistency["ok"]:
            print(f"  {status_icon(True)} {domain}")
            print(f"        本地解析: {', '.join(consistency['local_ips'][:3])}")
        else:
            if consistency.get("mismatch"):
                print(f"  {status_icon(False)} {domain} - DNS 解析结果与公共 DoH 不一致（疑似 DNS 劫持）")
                print(f"        本地: {consistency['local_ips']}")
                print(f"        DoH:  {consistency.get('doh_ips', {})}")
                report["issues"].append(f"DNS 解析异常 ({domain}): 本地与 DoH 结果不一致")
                deductions.append(20)
            else:
                print(f"  {status_icon(False)} {domain} - {consistency.get('error', '解析失败')}")
                report["issues"].append(f"DNS 解析失败: {domain}")
                deductions.append(10)

    report["sections"]["dns"] = dns_results

    # ------ 4. 网络延迟与丢包检测 ------
    section_header("4. 网络延迟与丢包检测")
    ping_targets = ["www.apple.com", "gateway.push.apple.com", "8.8.8.8"]
    ping_results = {}

    for target in ping_targets:
        ping = check_ping(target)
        ping_results[target] = ping
        loss = ping.get("packet_loss_pct", -1)
        latency = ping.get("avg_latency_ms", -1)

        if ping["ok"] and loss <= 5:
            print(f"  {status_icon(True)} {target} - 延迟: {latency}ms | 丢包: {loss}%")
        elif ping["ok"] and loss <= 20:
            print(f"  {warn_icon()} {target} - 延迟: {latency}ms | 丢包: {loss}% (网络质量一般)")
            deductions.append(3)
        else:
            print(f"  {status_icon(False)} {target} - 延迟: {latency}ms | 丢包: {loss}%")
            report["issues"].append(f"网络质量差 ({target}): 丢包 {loss}%")
            deductions.append(8)

    report["sections"]["ping"] = ping_results

    # ------ 5. 强制门户 / 恶意热点检测 ------
    section_header("5. 强制门户（Captive Portal）检测")
    captive = detect_captive_portal()
    report["sections"]["captive_portal"] = captive

    if captive["ok"]:
        print(f"  {status_icon(True)} 未检测到强制门户，网络出口正常")
    else:
        print(f"  {status_icon(False)} 检测到强制门户或 HTTP 劫持")
        for d in captive["details"]:
            if d["captive_detected"]:
                redir = d.get("redirected_to", "N/A")
                print(f"        {warn_icon()} {d['provider']}: 重定向至 {redir}")
        report["issues"].append("检测到强制门户/HTTP 劫持，可能处于恶意热点环境")
        deductions.append(25)

    # ------ 6. 本地代理/抓包工具检测 ------
    section_header("6. 本地代理 / 抓包工具端口检测")
    proxy = scan_local_proxy_ports()
    report["sections"]["proxy_ports"] = proxy

    if proxy["ok"]:
        print(f"  {status_icon(True)} 未发现常见代理/抓包端口开启")
    else:
        for p in proxy["open_ports"]:
            print(f"  {warn_icon()} 端口 {p['port']} 开放 - {p['description']}")
        report["issues"].append(f"检测到 {len(proxy['open_ports'])} 个可疑代理端口")
        deductions.append(10)

    # ------ 7. VPN / 网络接口检测 ------
    section_header("7. 网络接口与 VPN 检测")
    iface = check_network_interfaces()
    report["sections"]["interfaces"] = iface

    if iface.get("vpn_detected"):
        print(f"  {info_icon()} 检测到 VPN/隧道接口（VPN 开启时部分检测结果可能受影响）")
    else:
        print(f"  {info_icon()} 未检测到 VPN 隧道接口")

    # ------ 评分与风险定级 ------
    total_deduction = min(sum(deductions), 100)
    report["score"] = max(0, 100 - total_deduction)

    if report["score"] >= 90:
        report["risk_level"] = "低"
    elif report["score"] >= 70:
        report["risk_level"] = "中"
    elif report["score"] >= 50:
        report["risk_level"] = "高"
    else:
        report["risk_level"] = "极高"

    # ------ 汇总输出 ------
    section_header("综合评估结果")

    score = report["score"]
    risk = report["risk_level"]
    if score >= 90:
        score_color = Colors.OK
    elif score >= 70:
        score_color = Colors.WARN
    else:
        score_color = Colors.FAIL

    print(f"\n  网络健康评分: {colored(f'{score}/100', score_color)}")
    print(f"  风险等级:     {colored(risk, score_color)}")
    print(f"  扫描时间:     {report['scan_time']}")
    print(f"  发现问题:     {len(report['issues'])} 项")

    if report["issues"]:
        print(f"\n  {colored('问题清单:', Colors.BOLD)}")
        for i, issue in enumerate(report["issues"], 1):
            print(f"    {i}. {issue}")

    print(f"\n  {colored('安全建议:', Colors.BOLD)}")
    if report["score"] >= 90:
        print("    - 当前网络环境健康，继续保持系统更新")
    else:
        if any("MITM" in i or "证书" in i for i in report["issues"]):
            print("    - [紧急] 检测到证书异常，立即断开当前网络，切换至可信网络")
            print("    - [紧急] 检查设备是否安装了未知的根证书（设置 → 通用 → 关于本机 → 证书信任设置）")
        if any("DNS" in i for i in report["issues"]):
            print("    - 建议启用加密 DNS（DoH/DoT）或切换至可信 DNS（如 1.1.1.1 / 8.8.8.8）")
        if any("强制门户" in i or "热点" in i for i in report["issues"]):
            print("    - 当前可能处于恶意热点环境，避免传输敏感数据，建议使用 VPN")
        if any("代理" in i for i in report["issues"]):
            print("    - 检测到本地代理端口，确认是否为授权的调试/安全测试工具")
        if any("不可达" in i for i in report["issues"]):
            print("    - Apple 关键服务不可达可能导致安全更新无法下载，请检查网络或防火墙策略")
        if any("丢包" in i or "延迟" in i for i in report["issues"]):
            print("    - 网络质量不佳，可能影响安全更新推送的及时性")

    # ------ 保存 JSON 报告 ------
    report_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               f"ios_network_health_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")

    serializable = json.loads(json.dumps(report, default=str, ensure_ascii=False))
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(serializable, f, ensure_ascii=False, indent=2)

    print(f"\n  详细报告已保存: {report_path}")
    print(f"\n{'='*60}\n")

    return report


if __name__ == "__main__":
    print(colored(r"""
    ╔══════════════════════════════════════════════════╗
    ║   iOS 设备网络健康监测工具  v1.0                ║
    ║   用途：网络安全环境评估与威胁检测              ║
    ╚══════════════════════════════════════════════════╝
    """, Colors.INFO))

    run_full_scan()
