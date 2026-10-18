# Coruna与DarkSword恶意载荷技术分析：C2协议指纹、IOC提取与SOC检测规则构建

**文档类型：** 网络安全研究报告  
**研究对象：** Coruna 漏洞 / DarkSword 漏洞  
**目标读者：** 移动端安全分析师、反间谍软件研究者、企业 MDM 管理员  
**研究原则：** 仅基于公开技术材料做防御视角分析；区分"已证实 / 技术推断 / 未验证假设"三个层级；不编写可复现的利用代码  
**说明：** 本报告不构成任何攻击建议或操作指引

---

## 摘要

Coruna 与 DarkSword 代表了当前 iOS 高级持久化威胁（APT）中两种不同但互补的攻击范式。Coruna 以 JIT 溢出触发链为核心，侧重通过浏览器水坑投递实现零点击入侵；DarkSword 则以 VFS 竞态条件与 GPU 渲染管道滥用为特征，侧重于系统级权限提升后的长期驻留。两者的恶意载荷在结构设计、编码方式、分阶段加载策略以及 C2（Command-and-Control）通信协议上存在显著差异。本报告从防御方视角出发，系统性地梳理两类载荷的技术特征、提取可用于 IOC（Indicator of Compromise）检测的规则，并为 SOC（Security Operations Center）团队提供可落地的检测框架。

所有结论按照"已证实""技术推断""未验证假设"三个置信度层级标注。

---

## 一、恶意载荷整体架构对比

### 1.1 Coruna 载荷结构

Coruna 的载荷设计呈现典型的多阶段 Loader 模式：

```text
Phase 1: 容器伪装文件（PDF/HEIC/ZIP）
    └─ Phase 2: JS 解释器环境中的 JSC payload（内存驻留）
         └─ Phase 3: 利用 JSC JIT 触发后生成的 shellcode
              └─ Phase 4: 动态拉取的远端二进制模块
                   └─ Phase 5: 持久化植入 + C2 信标注册
```

**已证实：** Phase 1 到 Phase 3 的链条已在多个样本中被逆向确认。Phase 4 的动态拉取行为表明攻击者保留了灵活更新能力。**技术推断：** Phase 4 模块与 Phase 5 之间存在加密通道，但具体加密算法因样本差异未能统一确认。

### 1.2 DarkSword 载荷结构

DarkSword 采用更扁平化的两阶段模型，但在每一阶段内部嵌入了更多混淆层：

```text
Stage A: 初始注入点（MTI / Plist 配置文件欺骗）
    └─ Stage B: 内存中的 Mach-O 片段重组
         ├─ Branch B1: GPU/ANGLE 渲染管道劫持路径
         ├─ Branch B2: VFS 竞态条件下的文件系统写入路径
         └─ Branch B3: 系统服务伪装进程注册
              └─ Stage C: 隐蔽 C2 守护进程 + 数据外传模块
```

**已证实：** Stage A 和 Stage B 中的多个注入点在真实设备取证中已被定位。**未验证假设：** Branch B1-B3 的分流执行逻辑尚缺乏完整的自动化流程跟踪证据。

### 1.3 载荷对比表

| 维度 | Coruna 载荷 | DarkSword 载荷 |
|------|------------|---------------|
| 触发入口 | JSC JIT 溢出（浏览器相关） | VFS 竞态 + GPU 渲染管道 |
| 载荷形态 | 多阶段 Loader + 远端拉取 | 内存 Mach-O 重组 + 分支执行 |
| 静态特征 | 低熵区域集中、签名伪造 | 高混淆、碎片化二进制片 |
| 动态行为 | 浏览器进程内活动为主 | 跨进程、跨系统服务扩散 |
| C2 延迟 | 长间隔 + QUIC 信道 | 短轮询 + Domain Fronting |

---

## 二、编码与混淆技术分析

### 2.1 Coruna 编码策略

**已证实：** Coruna 的第一阶段容器通常采用 Base64 + zlib 压缩的组合编码。Payload 内部的 Shellcode 部分使用简单 XOR 掩码进行静态防分析保护，掩码长度通常为 1~4 字节循环。

**技术推断：** 第二阶段（JS 解释器环境内的 Payload）在加载时会进行运行时解码，解码完成后直接在 JSC 的 executable memory 区域执行，不留磁盘痕迹。

### 2.2 DarkSword 混淆手段

**已证实：** DarkSword 的 Stage B 使用了 Mach-O 文件的非标准 Segmentation 布局——其 load commands 被重排到非常规地址空间，使得常规静态分析工具无法正确解析符号表。**技术推断：** 这种手法利用了 dyld 加载器的容错性——只要关键 segment 偏移正确即可执行，即使元数据混乱。

### 2.3 混淆强度对比

| 混淆层 | Coruna | DarkSword |
|--------|--------|-----------|
| 编码覆盖 | Base64/zlib/XOR | Mach-O 重排/段错位/指令替换 |
| 动态解密 | 有（运行时） | 有（启动时 + 周期性） |
| 反调试检测 | 基础 | 中等（多路径绕过） |
| 沙箱逃逸尝试 | 低 | 中等 |

---

## 三、C2 通信协议深度分析

### 3.1 QUIC 基带 C2 — Coruna 的特征

**已证实：** Coruna 的 Phase 5 模块在建立 C2 连接时优先使用 QUIC（HTTP/3）协议而非传统的 HTTPS/TCP。QUIC 的优势在于：

- UDP 端口 443 双用，难以通过纯 TCP 规则拦截
- 0-RTT 握手降低信标延迟
- 内置加密天然规避中间人解密

```text
Coruna QUIC Beacon 流量模式:
Device → [QUIC Client Hello] → Front-proxy.example.com:443
Front-proxy → [Internal Hop] → Actual-C2-Server
Actual-C2 → [Encrypted Command Stream] → Device
```

**技术推断：** 前置代理（front-proxy）可能使用 Cloudflare Workers 或类似边缘计算平台搭建，这使得 C2 基础设施追踪面临 CDN 日志获取困难。

### 3.2 Domain Fronting — DarkSword 的策略

**已证实：** DarkSword 广泛采用 Domain Fronting 技术——C2 请求的 HTTP Host header 指向一个看似合法的域名（如 cdn.apple-img.com），而 DNS 解析结果则指向攻击者控制的 IP。**技术推断：** 部分样本显示 DarkSword 会在首次 beacon 时使用 TLS SNI spoofing 来进一步隐藏真实目的地。

### 3.3 低带宽信标模式

两类攻击均采用了低频 Beacon 设计以降低检测概率：

| 参数 | Coruna | DarkSword |
|------|--------|-----------|
| 默认轮询间隔 | 8~24 小时 | 15~45 分钟 |
| 数据量上限 | < 5KB/beacon | < 2KB/beacon |
| 心跳包大小 | ~200 bytes | ~150 bytes |
| 失败重试策略 | Exponential backoff ×5 | 立即重试 ×2 + 降级协议 |

**未验证假设：** Coruna 可能在设备检测到 Wi-Fi 连接后才发起数据传输，以避开蜂窝网络的异常检测。

---

## 三.5 Coruna 与 DarkSword 的分阶段加载（Staging）差异

### 3.5.1 Coruna 的"拉取式"Staging 模式

**已证实：** Coruna 在第一阶段 exploit 成功后，不会立即携带完整的 payload。它首先执行一段轻量级的 bootstrap code，该代码负责：

```text
Bootstrap Sequence (Coruna):
Step 1: 从 /Library/Caches/ 或临时目录读取第一层解密密钥
Step 2: 建立 outbound QUIC 连接至 C2 服务器
Step 3: 发送 device-fingerprinting request（包含 model ID、OS version、locale）
Step 4: 接收 server-configured response → 返回适配的二进制模块 URL
Step 5: 使用 NSURLSession downloadTask 获取二进制模块
Step 6: 写入本地缓存后通过 dlopen() 动态载入
Step 7: 清除下载痕迹，删除临时文件
```

**技术推断：** 第四步中的 device-fingerprinting 意味着攻击者可以根据目标设备的具体配置推送定制化的 payload，而非通用的单一版本。

### 3.5.2 DarkSword 的"嵌入式"Staging 模式

**技术推断：** DarkSword 在初始注入点（Stage A）即包含了大部分功能模块，无需远端拉取。这意味着：

- 首次入侵即可获得完整能力，无"等待下载"的脆弱窗口期
- 但初始载荷体积更大（估计 > 500KB），增加了隐蔽投递的难度
- 后续模块更新可能仍需远端通信，但频率远低于 Coruna

**未验证假设：** DarkSword 可能在 MDM profile 安装阶段即完成全量部署——MDM profile 拥有较高的文件系统权限，可为后续驻留提供充足空间。

### 3.5.3 Staging 策略对比

| 维度 | Coruna（拉取式） | DarkSword（嵌入式） |
|------|----------------|-------------------|
| 首次入侵完整性 | 不完整，需二次拉取 | 完整能力就绪 |
| 远端依赖度 | 高 | 中 |
| 载荷体积 | 小（bootstrap < 50KB） | 较大（> 500KB） |
| 被中途阻断风险 | 有 | 低 |
| 取证发现难度 | 高（内存驻留为主） | 中（部分磁盘 artifact） |

---

## 四、IOC 提取与分类

### 4.1 网络层 IOC

```yaml
Network_IOC_Categories:
  Domain_Indicators:
    - DGA 生成的二级域名前缀模式
    - Cloudflare CDN 子域下的可疑路径
    - Fast-flux DNS 解析记录
    
  Certificate_Indicators:
    - 自建 CA 签名的 TLS 证书
    - CN/SAN 字段仿冒苹果域名特征
    
  Header_Indicators:
    - User-Agent 异常组合
    - Sec-Fetch-Dest 空值发送
```

### 4.2 主机层 IOC

| IOC 类别 | Coruna 指标 | DarkSword 指标 |
|---------|-----------|--------------|
| 文件哈希 | JSC payload hash 范围 | Mach-O loader hash |
| 内存特征 | JIT 区域 entropy < 2.0 | dyld 重排 segment |
| 进程行为 | Safari/WebKit 异常 fork | NSURLConnection 伪装 |
| 注册项 | LaunchDaemon plist | ATS background task |

**技术推断：** 两类载荷都会在 `/private/var/containers/Bundle/Application` 下创建临时缓存目录用于存放下载的二进制模块。**未验证假设：** 这些目录可能通过 Spotlight indexing hook 实现快速检索。

---

## 五、SOC 检测规则构建指南

### 5.1 SIEM 关联规则设计

**规则 1 — QUIC 异常模式检测：**

```text
条件: protocol == "QUIC" 
AND dest_port == 443 
AND tls_sni != known_cdn_pattern
AND bytes_sent > 500
AND event_hour IN (23,0,1,2,3)
=> Alert Level: HIGH
   Tag: "iOS_Background_Beacon_Suspect"
```

**规则 2 — 浏览器进程网络行为异常：**

```text
条件: process_name MATCHES "^(MobileSafari|com\.apple\.webkit\.service)$"
AND outbound_connection == true
AND connection_dest NOT IN browser_known_hosts
AND time_of_day OUTSIDE user_active_hours
=> Alert Level: MEDIUM
   Tag: "Browser_Process_Network_Anomaly"
```

### 5.2 YARA 规则框架思路

**技术推断：** 针对 Coruna 的 YARA 规则应聚焦于：
- `.text` 段的 entropy 特征（JIT generated code）
- `malloc`/`mmap` 附近的 syscall pattern
- 特定字符串常量如 `_kCFAllocatorSystemDefault` 的引用模式

针对 DarkSword：
- 非标准 Mach-O segment 偏移检测
- dyld_override_symbol hook pattern
- 异常的 `open_at_internal_np` 调用序列

### 5.3 EDR 行为监控配置

| 监控事件 | 对应检测对象 | 置信度 |
|---------|------------|-------|
| WebKit 进程 fork 出非子进程 | Coruna Phase 4 | 已证实 |
| VFS 异常 open/close 密集序列 | DarkSword Stage B | 已证实 |
| NSURLSessionBackgroundConfiguration 启用 | 两者 C2 | 技术推断 |
| LaunchDaemons 动态注册 | DarkSword Stage C | 已证实 |
| Keychain Access-When-First Unlock 访问 | 两者凭证窃取 | 已证实 |

---

## 六、总结与建议

Coruna 与 DarkSword 的载荷设计和 C2 协议反映了攻击者在 stealth 与 reliability 之间寻求平衡的不同取舍。Coruna 倾向于利用现有基础设施（CDN、QUIC、JIT 编译环境）掩盖恶意行为；DarkSword 则通过系统底层的合法机制（dyld、VFS、后台 task）实现更深层次的融合。

**对 SOC 团队的建议清单：**
1. 部署基于 TLS 指纹（JA3/JA4）的出站连接检测，覆盖 QUIC 场景
2. 监控浏览器进程的异常网络外联行为
3. 在 MDM 环境中限制 background fetch 和 remote notification 的使用范围
4. 建立定期的 TLS 证书透明度日志审计机制
5. 对于高价值用户，考虑部署运行时完整性监控（RIM）方案

**咨询iOS系统安全相关问题，请联系 Telegram：https://t.me/one00190**
