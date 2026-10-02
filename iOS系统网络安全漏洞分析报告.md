# iOS 系统网络安全漏洞分析报告

| 项目 | 内容 |
| --- | --- |
| 报告名称 | iOS 系统网络安全漏洞分析报告 |
| 报告版本 | V1.0 |
| 编制日期 | 2026-10-02 |
| 数据截止 | 2026-10-02 |
| 文档密级 | 内部资料 |
| 适用对象 | 安全分析人员、企业 IT/安全团队、移动应用开发者 |

> **声明**：本报告仅供防御性安全研究、风险评估与安全建设参考。文中漏洞原理与攻击链描述均基于公开威胁情报、厂商公告与权威第三方研究文献，不包含任何可直接利用的漏洞利用代码。请遵守《网络安全法》及相关法律法规，未经授权不得对任何系统开展渗透测试。

---

## 1 概述

### 1.1 背景与目的

iPhone 因其封闭的软硬件一体化架构，长期被认为是安全性最高的移动终端之一。然而近十年来，面向 iOS 的定向攻击（尤其是"零点击"远程攻击）持续演进，已经成为以色列 NSO Group、Intellexa 等商业间谍软件厂商以及国家级 APT 组织的重点研究方向。

本报告聚焦 **iOS 的网络攻击面**，系统性梳理：

- iOS 网络通信栈及其安全机制；
- 各网络入口（消息、Wi-Fi、蓝牙、基带、浏览器、媒体解析器、应用层通信）的攻击面特征；
- 2016—2026 年具有代表性的远程漏洞案例深入分析；
- 漏洞利用趋势、风险评估与防护建议。

### 1.2 报告范围与分析方法

| 维度 | 说明 |
| --- | --- |
| 分析对象 | iOS / iPadOS 系统本体及其内置网络服务、系统级解析组件 |
| 时间范围 | 2016 年（Trident 事件）至 2026 年 9 月最新补丁 |
| 数据来源 | Apple 安全公告、Google Project Zero、Citizen Lab、Kaspersky、NVD 及公开威胁情报 |
| 分析方法 | 攻击面枚举 → 典型案例拆解（攻击链还原）→ 趋势归纳 → 风险矩阵评估 → 防护建议 |

### 1.3 当前版本背景（截至 2026-10-02）

| 版本 | 状态 | 说明 |
| --- | --- | --- |
| iOS 27 / 27.0.1 | 当前主力版本 | iOS 27 于 2026-09-14 发布，27.0.1 于 2026-09-28 发布 |
| iOS 26 系列（26.x） | 持续维护 | 为未升级设备提供安全更新；26.7.1（2026-09）修复 CVE-2026-86950 |
| iOS 18 及更早 | 有限维护 | 部分旧机型长期停留在旧版本，是定向攻击的重点目标 |

值得关注的是，iOS 26 在搭载 A19 芯片的 iPhone 17 系列上引入了 **内存完整性保护（Memory Integrity Enforcement, MIE）**，将硬件内存标签（MTE）与安全分配器、类型隔离等机制结合，覆盖内核与 70 余个高价值进程，旨在大幅抬高内存破坏类漏洞的利用成本——这是本报告分析期内 iOS 平台最重要的架构级安全升级。

### 1.4 术语与缩写

| 缩写 | 全称 | 说明 |
| --- | --- | --- |
| ATS | App Transport Security | 应用传输安全，iOS 9+ 的 HTTPS 强制策略 |
| AWDL | Apple Wireless Direct Link | Apple 点对点无线协议，AirDrop/AirPlay 底层依赖 |
| BLE | Bluetooth Low Energy | 低功耗蓝牙 |
| CVE | Common Vulnerabilities and Exposures | 通用漏洞编号 |
| CVSS | Common Vulnerability Scoring System | 通用漏洞评分系统 |
| DoH / DoT | DNS over HTTPS / TLS | 加密 DNS |
| MDM | Mobile Device Management | 移动设备管理 |
| MIE | Memory Integrity Enforcement | 内存完整性保护（iOS 26+，A19 芯片） |
| PAC | Pointer Authentication Code | 指针认证，ARMv8.3+ 硬件机制 |
| PPL | Page Protection Layer | 页保护层，保护内核页表完整性 |
| PSR | Private Relay | iCloud 私密代理 |
| RSR | Rapid Security Response | 快速安全响应（iOS 16+） |
| RCE | Remote Code Execution | 远程代码执行 |
| OOB / UAF | Out-of-Bounds / Use-After-Free | 越界访问 / 释放后使用 |
| 0-click | Zero-click | 零点击，无需受害者任何交互即触发 |
| 1-click | One-click | 需一次点击（如打开链接） |
| N-day | N-Day | 漏洞披露/修补后被二次利用的漏洞 |

---

## 2 iOS 网络安全体系架构

### 2.1 网络通信栈与安全组件

iOS 网络栈自上而下可分为应用 API 层、传输层、系统网络框架层与底层协议/硬件层，各层的安全控制强度不同：

| 层级 | 主要组件 | 安全机制 |
| --- | --- | --- |
| 应用 API 层 | URLSession / NSURLSession、WebKit 网络栈 | 受 ATS 强制约束；支持证书固定（应用自行实现） |
| 传输框架层 | CFNetwork、Network.framework | TLS 1.2/1.3、QUIC；ATS 在此层生效 |
| 网络扩展层 | Network Extension（VPN、DNS 代理、内容过滤） | 企业级隧道、加密 DNS、按应用代理 |
| 底层接口 | BSD Socket、原始套接字 | **不受 ATS 约束**，应用可自行实现协议（风险点） |
| 协议与硬件层 | Wi-Fi（含 AWDL）、蓝牙、蜂窝基带、NFC | 由固件/芯片实现，历史上是远程攻击高发区 |

**要点**：ATS 只覆盖基于 CFNetwork/URLSession 的通信；直接使用 BSD Socket 的应用（P2P、自研协议等）完全绕过 ATS，其加密与校验策略取决于开发者实现，是应用层风险评估的重点。

### 2.2 App Transport Security（ATS）

ATS 是 iOS 9 引入的网络加固策略，默认要求：

- 通信必须使用 **HTTPS（TLS 1.2 及以上）**；
- 禁用弱加密套件，要求前向保密（PFS）；
- 证书链须满足系统信任要求（SHA-256 签名、有效期校验等）。

常见削弱配置：

| 配置项 | 风险 |
| --- | --- |
| `NSAllowsArbitraryLoads = YES` | 全局关闭 ATS，任意 HTTP 明文通信 |
| `NSExceptionDomains` 宽泛例外 | 对特定域降级，易被利用做降级攻击 |
| `NSAllowsLocalNetworking` 滥用 | 本地网络通信例外被扩大化使用 |

### 2.3 证书信任体系

- 系统内置根证书库由 Apple 统一维护，信任链根植于 Secure Enclave 保护的信任存储；
- iOS 支持通过设置手动安装/信任企业根证书——**这是中间人攻击（MITM）在企业与灰产场景中最常被利用的信任面**；
- 部分场景支持证书透明度（CT）辅助校验，但并非全量强制。

### 2.4 隐私增强的网络特性

| 特性 | 机制 | 防护目标 |
| --- | --- | --- |
| 加密 DNS（DoH/DoT） | iOS 14+ 通过描述文件或 App（DNS 代理扩展）启用 | 防 DNS 窃听/篡改 |
| iCloud 私密代理（iCloud+） | 双跳代理架构，入口代理知道来源 IP 不知目的地、出口代理反之 | 隐藏 IP、防跨站追踪 |
| 私有 Wi-Fi 地址 | 每个 SSID 使用随机化 MAC | 防跨网络跟踪 |
| WPA3 / PMF | 支持 SAE 握手与管理帧保护 | 防离线字典、防去认证攻击 |
| 私有访问令牌（PAT） | 通过 Apple 匿名中继证明"人类用户" | 替代验证码，防指纹追踪 |

### 2.5 与网络攻击链相关的平台加固

| 机制 | 引入版本 | 作用 |
| --- | --- | --- |
| 代码签名 + 强制沙盒 + Entitlements | iOS 长期机制 | 限制应用能力边界，攻击者越权需额外突破 |
| **BlastDoor** | iOS 14 | 在独立沙箱进程中解析 iMessage 消息内容（图片、链接、附件），解析类 0-click 漏洞被利用后仍被隔离在"无网络、无数据"的沙箱内 |
| PAC 指针认证 | A12+（装甲化于 iOS 14+） | 抵御控制流劫持，抬高内存破坏的利用门槛 |
| **MIE 内存完整性保护** | iOS 26 + A19 芯片 | 安全分配器 + 同步增强内存标签（EMTE）+ 类型隔离，覆盖内核与 70+ 进程；Apple 称使"多数内存破坏利用链成本大幅上升" |
| 锁定模式（Lockdown Mode） | iOS 16 | 关闭 iMessage 多数附件类型、JIT、复杂网页特性等，直接砍掉主流 0-click 攻击入口 |
| 快速安全响应（RSR） | iOS 16 | 无需完整系统更新即可下发关键安全补丁 |
| USB 受限模式 | iOS 11.4+ | 锁屏超过 1 小时禁用 USB 数据连接，抵御物理取证设备（如 2025 年 CVE-2025-24200 被用于绕过该机制） |
| 安全启动链 / Secure Enclave | 硬件机制 | 保障系统完整性根信任 |

---

## 3 攻击面分析

### 3.1 消息类入口（iMessage 及第三方 IM）

**这是近十年 iOS 远程攻击（尤其零点击）最核心的入口。**

| 项目 | 说明 |
| --- | --- |
| 暴露条件 | 攻击者仅需知道目标的手机号/Apple ID 即可发送消息，无需任何前置接触 |
| 攻击模式 | ① 零点击：恶意附件（图片、文档、Pass、字体）被系统自动解析；② 少交互：诱导点击链接进入 WebKit；③ 社工型：仿冒页面窃取凭证 |
| 系统级风险点 | iMessage 渲染链复用系统解析器（ImageIO、CoreGraphics、FontParser、QuickLook），任一解析器漏洞都可能转化为 0-click 链的起点 |
| 缓解现状 | BlastDoor 沙箱（iOS 14+）显著提高了利用难度；锁定模式可直接屏蔽附件解析 |
| 第三方 IM | WhatsApp、Telegram 等虽自主实现协议，但媒体解析同样复用 iOS 系统框架（如 2025 年 WhatsApp × ImageIO 零点击链），并非独立安全边界 |

### 3.2 Wi-Fi 与 AWDL / AirDrop

| 子攻击面 | 风险特征 | 代表案例 |
| --- | --- | --- |
| Wi-Fi 芯片固件 | 固件闭源、与主处理器共享内存，空中接口可达 | Broadpwn（CVE-2017-9417） |
| AWDL 协议 | 默认开启、无需配对即可发现与建立数据通道，攻击者无需连接同一 AP | CVE-2020-3843 |
| WPA2 协议层 | 四次握手密钥重装 | KRACK（CVE-2017-13077 系列） |
| AirDrop 隐私 | 联系人哈希可被枚举以推断手机号/邮箱；诱导接收恶意文件 | 学术研究（TU Darmstadt 等） |
| 恶意热点 | 强制门户仿冒、DHCP/DNS 劫持、降级诱导 | 通用威胁 |

**分析**：Wi-Fi 相关的远程 RCE 在 2017—2020 年较为活跃；随着固件隔离增强与协议修复，当前该面上更高频的风险是**恶意热点与中间人**（数据窃取类），而非远程控制类。

### 3.3 蓝牙（BLE）

- 蓝牙处于"物理邻近"攻击面：攻击者需在数十米范围内；
- 历史漏洞以信息泄露与拒绝服务为主，远程代码执行较少但仍存在；
- 代表性事件：**CVE-2026-20650（CVSS 7.5）**——蓝牙协议实现缺陷，处于授权网络位置（邻近范围）的攻击者可通过构造报文造成拒绝服务，影响 iOS/macOS 等 v26.3 及之前版本，已在 26.3+ 修复；
- 配件同样是攻击面：2026 年 6 月 Apple 修复了 Beats Studio Buds 耳机的高危"窃听"漏洞（邻近攻击者可劫持耳机音频），提示**蓝牙外设固件已成为生态安全短板**。

### 3.4 蜂窝基带与 SIM/eSIM

- 基带处理器运行独立实时操作系统（闭源，供应链涉及高通、博通及 Apple 自研芯片），与主系统间通过共享内存/PCIe 通信；
- 攻击场景：伪基站（IMSI catcher）、降级到 2G、SIM 工具包（如 Simjacker 类攻击）、恶意 OTA 消息；
- 基带漏洞的公开信息远少于应用处理器，多数定向攻击（如 Partaix? 等未具名案例）从未公开利用细节，评估难度大；
- **风险定性**：利用门槛极高（需掌握未公开漏洞与射频设备），但一旦利用即具备完全控制能力，属于高价值目标面临的主要威胁之一。

### 3.5 WebKit / Safari

- 浏览器渲染引擎是 1-click 攻击链的传统主入口：诱导点击恶意链接 → WebKit RCE → 内核提权 → 越狱级持久化；
- 自 2016 年 Trident 至 2025 年 CVE-2025-24201，WebKit 几乎每年都有"已在野利用"级别的漏洞披露；
- 恶意广告（malvertising）与"水坑"站点将其规模化，面向大众而非仅定向目标。

### 3.6 媒体与文档解析引擎（重点）

系统级解析组件被**消息、浏览器、Wi-Fi 配网、QuickLook 预览等多路径复用**，是 0-click 攻击的弹药库：

| 组件 | 职责 | 典型案例 |
| --- | --- | --- |
| ImageIO | 图片编解码 | CVE-2023-41064、CVE-2025-43300 |
| CoreGraphics（JBIG2/PDF） | 图形与 PDF 解析 | CVE-2021-30860（FORCEDENTRY）、CVE-2026-86950 |
| libwebp | WebP 图片解码 | CVE-2023-4863 |
| FontParser | 字体解析（TrueType） | CVE-2023-41990（三角测量行动） |
| CoreAudio / CoreMedia | 音视频解析 | CVE-2025-31200、CVE-2025-24085 |
| dyld | 动态链接器 | CVE-2026-20700 |

**结论**：该攻击面呈现"**入口收敛、出口放大**"特征——攻击者只需攻破一个被多进程复用的解析器，即可获得多条投递路径（消息附件、浏览器、预览），因此成为 Apple 补丁频率与投入最高的领域。

### 3.7 应用层网络实现缺陷

| 缺陷类型 | 描述 | 风险 |
| --- | --- | --- |
| ATS 全局关闭 | 大量 App 为兼容旧接口保留 `NSAllowsArbitraryLoads` | 明文通信可被窃听/篡改 |
| 证书固定缺失或错误 | 未实现固定，或固定至叶子证书导致更新失败后被动降级 | 在受控网络（恶意 Wi-Fi、企业代理）中被 MITM |
| 证书固定可被绕过 | 越狱设备上可用 SSL Kill Switch、Frida 等工具绕过固定 | 安全测试需覆盖越狱场景 |
| 第三方 SDK 数据外传 | 广告/统计 SDK 将设备与网络数据回传境外 | 合规与数据泄露风险 |
| 网络缓存/日志残留 | 敏感数据写入 URL、日志、剪贴板 | 取证面扩大 |

### 3.8 管理通道与企业环境

- MDM 描述文件可安装企业根证书、配置代理与 VPN，一旦 MDM 或证书体系被滥用/失陷，即形成对该组织全部终端的系统性 MITM 能力；
- 企业"SSL 检查"设备本身即合法的中间人节点，其证书保护强度与访问控制直接决定风险水平。

---

## 4 典型漏洞案例深入分析

### 4.1 案例一：Trident（2016）——商用间谍软件的起点

| 项目 | 内容 |
| --- | --- |
| CVE 编号 | CVE-2016-4655 / 4656 / 4657 |
| 漏洞组件 | WebKit + XNU 内核 |
| 攻击向量 | SMS 发送链接，诱导用 Safari 打开（1-click） |
| 影响版本 | iOS < 9.3.5 |
| 修复版本 | iOS 9.3.5（2016-08-25） |
| 利用状态 | 在野利用（NSO Group Pegasus） |

**攻击链**：短信链接 → `CVE-2016-4657`（WebKit 内存破坏，浏览器 RCE）→ `CVE-2016-4655`（内核信息泄露，绕过 ASLR）→ `CVE-2016-4656`（内核 UAF，获得最高权限并持久化）。

**启示**：确立了"浏览器入口 + 内核提权"这一经典三段式链；标志着 iOS 定向攻击进入商业化时代（发现者为 Citizen Lab / Lookout）。

### 4.2 案例二：Broadpwn（2017）——Wi-Fi 芯片的空中 RCE

| 项目 | 内容 |
| --- | --- |
| CVE 编号 | CVE-2017-9417 |
| 漏洞组件 | 博通 BCM43xx Wi-Fi SoC 固件 |
| 漏洞类型 | 固件堆缓冲区溢出 → 芯片级 RCE |
| 攻击向量 | 攻击者在 Wi-Fi 射频范围内发送构造帧，**无需与目标连接同一网络**，零交互 |
| 影响版本 | iOS < 10.3.3 |
| 修复版本 | iOS 10.3.3（2017-07-19） |

**攻击链**：广播恶意 Wi-Fi 帧 → Wi-Fi 固件堆溢出 → 在固件上下文执行代码 → 利用"芯片与主 CPU 共享内存"写入主内存 → 在 iOS 侧实现代码执行。

**启示**：暴露了"外围芯片固件"这一隐形攻击面；厂商对固件层的审计与内存保护（当前 Wi-Fi 固件已普遍启用隔离）是此后十年加固重点。

### 4.3 案例三：KRACK（2017）——WPA2 协议层设计缺陷

| 项目 | 内容 |
| --- | --- |
| CVE 编号 | CVE-2017-13077 ~ 13088（一组 10 个） |
| 漏洞组件 | WPA2 四次握手实现（含 wpa_supplicant 系实现） |
| 攻击向量 | 攻击者位于无线覆盖范围内，中间人重放握手第三帧，强制密钥重装（nonce 重用） |
| 影响 | 流量解密、数据包注入（对实施存在缺陷的平台/签名场景效果不同） |
| 修复 | Apple 于 iOS 11.1 / iOS 10.3.3 安全更新中修复相关实现缺陷 |

**启示**：协议层缺陷影响所有厂商；单靠终端补丁无法根治，需 WPA3/802.11 修复协同。对 Apple 设备实际可利用性有限，但凸显了"攻击无线信道本身"（而非攻击终端实现）的思路。

### 4.4 案例四：AWDL 远程漏洞（2020，CVE-2020-3843）

| 项目 | 内容 |
| --- | --- |
| CVE 编号 | CVE-2020-3843（同批次共 5 个在野 0-day 中的一员） |
| 漏洞组件 | AWDL（Apple Wireless Direct Link）协议栈 |
| 漏洞类型 | 堆缓冲区溢出 → Wi-Fi 芯片级/系统级 RCE |
| 攻击向量 | 无线邻近（射频可达）即可触发，**无需同一网络、无需配对**，零交互 |
| 影响版本 | iOS < 13.5 |
| 修复版本 | iOS 13.5（2020-05-20） |
| 发现方 | Google Project Zero（Ian Beer，"A Very Deep Dive into iOS Exploit Chains Found in the Wild"） |

**攻击链（还原的在野链）**：AWDL 漏洞远程 RCE（经 Wi-Fi 芯片）→ 内核漏洞提权 → 绕过关守机制 → 持久化植入（该链使用 5 个在野 0-day，指向受雇于某"无差别利用"的客户）。

**启示**：AWDL 等"默认开启的邻近协议"长期缺少足够审计；直到 2021+ Apple 才将 AWDL 逐步收敛（AirDrop 默认联系人白名单化等）。

### 4.5 案例五：FORCEDENTRY（2021，CVE-2021-30860）——"史上所见最复杂的漏洞利用"

| 项目 | 内容 |
| --- | --- |
| CVE 编号 | CVE-2021-30860 |
| 漏洞组件 | CoreGraphics 的 JBIG2 解码器（经 iMessage 图片缩略图解析触发） |
| 漏洞类型 | 整数溢出 → 内存破坏 → 沙箱内代码执行 |
| 攻击向量 | **iMessage 图片附件，零点击**（GIF 内嵌特制 JBIG2 流） |
| 影响版本 | iOS < 14.8（攻击者自 2016 年起长期使用 KISMET 系列 0-click 攻击同一漏洞面） |
| 修复版本 | iOS 14.8 / macOS 11.6（2021-09-13） |
| 利用状态 | 在野利用（NSO Group Pegasus）；Citizen Lab 取证确认 |
| 分析方 | Google Project Zero |

**技术要点**：攻击者在 JBIG2 逻辑运算（与/或/异或）的构造基础上，搭建了一台**基于 JBIG2 指令集的"虚拟机"**——约 7 万条指令构成的解释器，用于在解析器上下文中实现任意计算能力。Project Zero 评价其为"所见过的、针对内存破坏的最复杂漏洞利用之一"。

**启示**：
1. 系统级媒体解析器（尤其冷门格式如 JBIG2）是 0-click 攻击的最佳弹药；
2. 单一解析器被多进程复用会放大影响面；
3. 事件直接催生了 iOS 14 的 **BlastDoor** 沙箱，以及后续"消息附件解析链路重构"。

### 4.6 案例六：BLASTPASS（2023，CVE-2023-41064 + CVE-2023-4863）

| 项目 | 内容 |
| --- | --- |
| CVE 编号 | CVE-2023-41064（ImageIO 缓冲区溢出） + CVE-2023-4863（libwebp 堆溢出，NVD 8.8） |
| 漏洞组件 | ImageIO / libwebp |
| 攻击向量 | **iMessage 发送恶意 Wallet 凭证（.pkpass）附件，零点击** |
| 影响版本 | iOS 16.6 及之前（并波及 Chrome、Firefox 等使用 libwebp 的产品） |
| 修复版本 | iOS 16.6.1 / iPadOS 16.6.1（2023-09-07 紧急更新）；libwebp 上游同版本修复 |
| 利用状态 | 在野利用（NSO Group）；发现方 Citizen Lab / Apple SEAR |

**攻击链**：iMessage 投递 .pkpass 附件 → Wallet 渲染时触发 ImageIO 堆溢出（CVE-2023-41064），在消息解析沙箱中获得代码执行 → 利用 libwebp 堆溢出（CVE-2023-4863）完成沙箱逃逸/提权。

**启示**：这是"**消息附件 → 系统解析器 A 打进沙箱 → 系统解析器 B 逃逸**"的典型双引擎链。值得注意的是，第二个环节的 libwebp 漏洞同时影响全平台浏览器，展示了"单点解析器漏洞的跨产品放大效应"。

### 4.7 案例七：Operation Triangulation（2023—2024 披露）

| 项目 | 内容 |
| --- | --- |
| CVE 编号 | CVE-2023-41990（FontParser）、CVE-2023-32434（内核）、CVE-2023-32435（WebKit）、**CVE-2023-38606（内核，硬件寄存器滥用）** 等 |
| 漏洞组件 | 字体解析 + 内核内存子系统 + 未公开硬件 MMIO 寄存器 |
| 攻击向量 | **iMessage 投递含恶意 TrueType 字体的附件，零点击** |
| 影响版本 | iOS 15.7 / 16.5 及之前 |
| 修复版本 | iOS 16.5.1、15.7.7（2023-07-24）等 |
| 发现方 | 卡巴斯基 GReAT（针对其在俄员工的攻击中检出） |

**攻击链**：
1. 不可见 iMessage 消息携带恶意字体 → `CVE-2023-41990`（FontParser）零点击代码执行；
2. `CVE-2023-32434`（内核整数溢出）提权，配合 `CVE-2023-32435`（WebKit）加载后续载荷；
3. 最终环节 `CVE-2023-38606`：攻击者发现并通过**SoC 中未公开的硬件 MMIO 寄存器**直接改写受 PPL 保护的内核内存，绕过"页保护层"这一最后防线，实现隐蔽驻留与持久化。

**启示**：这是迄今公开的最复杂 iOS 攻击链之一。其标志性意义在于：**当软件层加固逼近极限时，攻击者转向硬件层未文档化机制**——硬件攻击面（协处理器、GPU、MMIO）成为顶级攻击者的新战场，也解释了 Apple 后续推进 MIE 等硬件级内存安全的动机。

### 4.8 案例八：WhatsApp × ImageIO 零点击链（2025）

| 项目 | 内容 |
| --- | --- |
| CVE 编号 | CVE-2025-55177（WhatsApp"链接设备"同步缺陷） + CVE-2025-43300（ImageIO 越界写入） |
| 漏洞组件 | WhatsApp 的链接设备消息同步 + Apple ImageIO |
| 攻击向量 | **零点击**：攻击者通过 WhatsApp 消息触发目标设备自动处理恶意图像内容（滥用链接设备同步路径） |
| 影响版本 | WhatsApp iOS < 2.25.21.73 / macOS < 2.25.21.78；iOS 18.6.1 及之前 |
| 修复版本 | WhatsApp 2025-07 前后；Apple iOS 18.6.2 / iPadOS 18.6.2（2025-08-20 紧急更新） |
| 利用状态 | 在野利用，针对约 90 名记者与公民社会成员（Citizen Lab 披露） |

**攻击链**：攻击者向目标发送特制消息 → WhatsApp 链接设备同步机制缺陷（CVE-2025-55177）导致目标设备自动下载并解析恶意图片 → 触发系统 ImageIO 越界写入（CVE-2025-43300）→ 零点击代码执行。

**启示**：
1. 第三方 IM 不是独立安全边界——媒体解析仍依赖系统框架，"App 侧逻辑缺陷 + 系统解析器漏洞"可以组合出完整零点击链；
2. 攻击者的关注点从"系统消息服务"扩展到"用户量最大的第三方通信应用"，防御方须同步评估两者。

### 4.9 2025—2026 年活跃利用漏洞概览

| 时间 | CVE | 组件 | 说明 | 修复版本 |
| --- | --- | --- | --- | --- |
| 2025-02 | CVE-2025-24200 | 辅助功能（USB） | 物理接入攻击可绕过 USB 受限模式（高级取证场景） | iOS 18.3.1 |
| 2025-03 | CVE-2025-24201 | WebKit | 越界写入，"极端复杂攻击"，针对 iOS 17.2 之前版本的目标 | iOS 18.3.2 |
| 2025-04 | CVE-2025-31200 + 31201 | CoreAudio / 代码签名绕过 | 组合链，"极端复杂攻击"针对特定目标 | iOS 18.4.1 |
| 2025-08 | CVE-2025-43300 + CVE-2025-55177 | ImageIO + WhatsApp | 零点击链，针对记者（见 4.8） | iOS 18.6.2 |
| 2026-02 | CVE-2026-20700 | dyld（动态链接器） | 内存破坏，"极端复杂攻击"针对特定个人 | iOS 26.3 |
| 2026-02 | CVE-2026-20650 | 蓝牙 | 蓝牙报文缺陷（CVSS 7.5），邻近攻击者拒绝服务 | iOS 26.3+ |
| 2026-09 | CVE-2026-86950 | CoreGraphics | 越界写入，恶意文件触发任意代码执行，定向攻击中在野利用 | iOS/iPadOS 26.7.1、macOS 26.7.1 等 |

**观察**：2025—2026 年 Apple 标注"极端复杂攻击 / 定向攻击"的补丁节奏未变，入口仍高度集中于**媒体解析器（ImageIO/CoreGraphics/CoreAudio/dyld）与消息路径**。

### 4.10 案例时间线汇总

| 时间 | 案例 | 入口 | 交互级别 | 主要能力 |
| --- | --- | --- | --- | --- |
| 2016-08 | Trident | SMS 链接（WebKit） | 1-click | 完整控制（Pegasus） |
| 2017-07 | Broadpwn | Wi-Fi 芯片 | 0-click | 芯片级 RCE |
| 2017-10 | KRACK | WPA2 握手 | 0-click（特定场景） | 解密/注入 |
| 2020-05 | AWDL 链 | Wi-Fi/AWDL | 0-click | 完整控制 + 持久化 |
| 2021-09 | FORCEDENTRY | iMessage 图片 | 0-click | 完整控制（Pegasus） |
| 2023-09 | BLASTPASS | iMessage Pass | 0-click | 完整控制（Pegasus） |
| 2023—24 | 三角测量行动 | iMessage 字体 | 0-click | 硬件级逃逸 + 持久化 |
| 2025-08 | WhatsApp × ImageIO | 第三方 IM | 0-click | 完整控制 |
| 2026-09 | CVE-2026-86950 | CoreGraphics | 0-click（文件解析） | 代码执行（定向） |

---

## 5 漏洞特征与趋势分析

### 5.1 零点击攻击已工业化

从 2016 年的"1-click 链接"到 2020 年以后连续出现的 0-click 链，攻击者的目标明确：**消除受害者一切可感知的交互**。0-click 链的弹药高度集中在"设备会**自动解析**的内容"上：消息附件、缩略图、字体、Wallet 凭证。只要系统"先解析、后询问"，0-click 入口就存在。

### 5.2 攻击链化与解析器收敛

近十年的高级攻击均为**多漏洞组合链**（典型 3—5 个漏洞：入口 RCE → 沙箱逃逸 → 内核提权 → 持久化）。同时，攻击面呈现"收敛"效应：

- 入口收敛：iMessage/消息附件是无可争议的第一入口（8 个深度案例中 6 个）；Wi-Fi、蓝牙等邻近入口相对降温；
- 弹药收敛：攻击者的注意力集中于少数被多路径复用的系统解析器（ImageIO、CoreGraphics、FontParser、libwebp），一次突破、多路投递。

### 5.3 商业化间谍软件是主要威胁驱动

Trident、FORCEDENTRY、BLASTPASS 均与 NSO Group 关联，三角测量行动指向"雇佣兵"级能力，2025 年 WhatsApp 链同样用于针对记者/公民社会——**iOS 漏洞利用的最大买方是商业间谍软件产业与国家背景行为体**。这意味着：大众用户的被动风险相对可控，而记者、律师、人权工作者、政务人员等高价值目标始终处于高风险区。

### 5.4 内存安全仍是核心矛盾，平台加固改写成本曲线

历数案例，绝大多数根因均为**内存破坏类缺陷**（整数溢出、堆溢出、UAF）。Apple 的应对层层加码：代码签名 → 沙箱 → BlastDoor → PAC → 硬件 MTE（MIE，iOS 26 + A19）。MIE 的效果有待长期验证，但"软件修补 → 硬件根治"的路径已经明确，其副作用是：**入门级攻击者将被淘汰，顶级攻击者加速转向硬件/供应链层**（如三角测量行动所示）。

### 5.5 N-day 利用窗口与版本碎片化

Apple 对在野漏洞的修复响应极快（如 BLASTPASS 48 小时内发布紧急补丁、2025/2026 多次"紧急更新"），但风险不在"修复速度"而在"安装速度"：

- 定向攻击者会保留针对旧版本的 N-day 利用（如 CVE-2025-24201 明确针对 iOS 17.2 之前版本）；
- 大量设备因机型老旧滞留于 iOS 18 及更早版本，长期暴露于已公开的漏洞；
- 企业与高价值个人的资产盘点（"哪些设备在什么版本"）因此成为风险管理的关键动作。

### 5.6 隐私层"非漏洞"风险与元数据问题

即使没有内存破坏漏洞，iOS 网络面仍存在设计层面的隐私风险：

- Wi-Fi/蓝牙持续广播（私有 MAC 缓解但非消除）可用于物理跟踪；
- AirDrop 联系人哈希可被用于号码/邮箱枚举；
- iMessage 端到端加密保护**内容**不保护**元数据**（通信双方、时间、频率）；
- 应用侧明文通信、第三方 SDK 外传仍是数据泄露的主要来源。

### 5.7 生态外延：配件与外设成为新短板

2026 年 Beats 耳机窃听漏洞表明：**与 iPhone 配对的蓝牙外设**开始成为攻击面（邻近劫持、窃听）。设备安全管理需从"终端"扩展到"终端 + 配件生态"。

---

## 6 风险分析

### 6.1 攻击面风险矩阵

| 攻击面 | 暴露条件 | 利用难度 | 潜在影响 | 2023—2026 活跃度 | 综合风险 |
| --- | --- | --- | --- | --- | --- |
| iMessage / 消息附件 | 仅需号码/Apple ID | 极高（需 0-day 链） | 完全控制、持续窃密 | 高（间谍软件主战场） | **极高** |
| 第三方 IM（WhatsApp 等） | 账号可达 | 高 | 完全控制 | 中—高 | **高** |
| WebKit / Safari | 诱导点击链接 | 中—高 | RCE + 提权 | 持续 | **高** |
| 系统媒体解析器（ImageIO 等） | 随消息/网页自动触发 | 高 | 沙箱内 RCE（链式起点） | 高 | **高** |
| 应用层通信缺陷（ATS/证书固定） | 中间人位置 | 低—中 | 数据泄露、凭证窃取 | 常见 | **高**（泄露类） |
| 蜂窝基带 | 伪基站/射频设备 | 极高 | 完全控制 | 低（不公开） | 中—高（定向） |
| Wi-Fi 芯片 / AWDL | 射频邻近 | 高 | RCE 历史案例 | 低（已大幅收敛） | 中 |
| 蓝牙 / 配件 | 邻近 | 中 | DoS、窃听 | 中（如 2026 年案例） | 中 |
| 物理接入（USB 取证） | 设备被扣押/接触 | 中 | 数据提取 | 中 | 视人群而定 |

### 6.2 不同人群的风险画像

| 人群 | 主要威胁 | 建议防护等级 |
| --- | --- | --- |
| 普通用户 | 恶意热点、钓鱼页面、应用层泄露 | 基线防护（第 7.1 节） |
| 企业员工/管理人员 | 供应链攻击、定向钓鱼、企业 MITM 合规风险 | 基线 + 企业管控（7.3） |
| 记者/律师/人权工作者/政务人员 | 商业间谍软件 0-click 链 | 强化防护（7.2，启用锁定模式） |
| 移动应用开发者 | 自身 App 的网络实现缺陷与 SDK 风险 | 安全开发（7.4） |

---

## 7 防护与整改建议

### 7.1 个人用户基线措施

1. **及时更新**：保持最新 iOS 正式版；对 Apple 标注"紧急安全更新/快速安全响应"的补丁优先于一切日常更新安装；
2. **开启自动更新**：设置 → 通用 → 软件更新 → 自动更新（全部开启）；
3. **iMessage 防护**：设置中关闭"预览附件自动下载"类行为无系统开关，但可开启"过滤未知发件人"；对可疑附件不点、不转存；
4. **网络习惯**：优先使用可信 Wi-Fi；对公共 Wi-Fi 不安装证书、不信任强制门户的证书弹窗；不接入来源不明的"免费热点"；
5. **蓝牙/Wi-Fi 按需开启**：不用时关闭蓝牙与无线局域网（注意：控制中心关闭是"断开"而非"禁用"，需在设置中彻底关闭）；
6. **Apple ID 安全**：开启双重认证，警惕 iMessage/短信钓鱼（伪造 Apple 通知）；
7. **USB 受限模式**：保持默认开启；长期不使用时避免在陌生充电桩直接插线。

### 7.2 高价值目标强化措施（记者、律师、政务、人权工作者等）

1. **启用锁定模式（Lockdown Mode）**：设置 → 隐私与安全性 → 锁定模式。该模式将屏蔽绝大多数已知 0-click 入口（附件类型、JIT、复杂网页特性、未知 FaceTime 来电等），是当前对抗商业间谍软件最有效的官方手段；
2. **最小化攻击面**：停用不用的系统服务（AirDrop、AirPlay、接力、隔空投送联系人限制为"联系人"）；
3. **不要升级普通设备的防护预期**：高价值目标应使用专用设备、专用号码，工作与个人通信分离；
4. **版本纪律**：一旦 Apple 发布"定向攻击"相关补丁，**当日完成更新**，不等待；
5. **痕迹排查**：如怀疑被入侵，保留设备原状并寻求专业取证（如 Citizen Lab 类机构协助），不要自行抹除数据；
6. **通信降险**：涉密讨论使用具备前向保密的专用工具，并注意元数据面（通信时间/频率）的泄露。

### 7.3 企业 / 组织层面

1. **资产与版本盘点**：建立 iOS 设备清单（机型、芯片世代、iOS 版本、组件 CVE 对齐），将"支持 MIE 的 A19 及后续芯片设备"纳入新采购基线；
2. **补丁管理 SLA**：普通补丁 7 天内、紧急补丁 24 小时内完成安装；对不能升级的旧设备建立例外审批与网络隔离策略；
3. **MDM 最小权限**：审计 MDM 描述文件、企业根证书与代理配置；SSL 检查仅覆盖必要的企业流量，并设置严格访问控制与日志审计；
4. **网络侧防护**：出口 DNS 加密（DoH/DoT）或企业 DNS 防护；对员工启用 iCloud 私密代理不冲突时保持开启以降低 IP 暴露；
5. **威胁情报联动**：订阅 Apple 安全公告、Citizen Lab/Kaspersky/Project Zero 等来源，对"定向攻击"类通告建立应急响应流程；
6. **安全意识**：针对高管与敏感岗位开展"零点击攻击不可见性"教育——**没有点击也可能被入侵**，异常现象（耗电、流量、过热）报告机制要简单直接。

### 7.4 面向开发者的安全实践

| 主题 | 建议 |
| --- | --- |
| ATS 配置 | 禁止全局 `NSAllowsArbitraryLoads`；例外按域名最小化并留存评审记录 |
| 证书固定 | 采用"固定公钥 + 备份固定"策略，避免固定叶子证书；评估越狱环境下的可绕过性 |
| 加密传输 | 使用 URLSession/Network.framework 默认链（TLS 1.3）；自研协议必须自实现前向保密与完整性校验 |
| 数据处理 | 敏感信息禁止放入 URL/日志/剪贴板；本地缓存加密（Data Protection + Keychain） |
| 第三方 SDK | 建立 SDK 清单与网络行为审计（域名、数据项、目的地），上线前进行抓包核验 |
| 依赖解析器 | 处理用户上传的图片/文档时，尽量依赖系统最新解析栈，避免自带老旧解码库（如旧版 libwebp） |

### 7.5 检测与响应要点

- 关注 Apple"已在野利用"通告中的 CVE 与受影响版本，第一时间比对资产；
- 对高价值目标的设备，监测异常流量模式（夜间外联、陌生域名心跳、加密信道长连接）；
- 保留诊断日志（设置 → 隐私与安全性 → 分析与改进），供取证使用；
- 建立"疑似 0-click 被入侵"预案：隔离设备、保全证据、联系专业机构，**切勿先行恢复出厂设置**。

---

## 8 结论

1. **iOS 仍是安全基线最高的移动平台之一**：强制沙盒、BlastDoor、PAC、MIE 等层层加固显著抬高了攻击成本，使 0-day 链的研发维持在高门槛、高成本状态。
2. **远程攻击的第一入口高度集中于消息与媒体解析路径**：2016—2026 年间所有具有代表性的 0-click 链，几乎全部以 iMessage/IM 附件与系统解析器（ImageIO、CoreGraphics、FontParser）为起点；Wi-Fi、蓝牙等传统网络入口的远程利用已大幅收敛，但配件与邻近攻击面出现新变量。
3. **威胁主体是商业间谍软件与国家级行为体**：方向明确、资源充足、不依赖用户犯错；普通用户的现实风险主要来自恶意热点、钓鱼与弱网络实现（应用层），而高价值目标始终处于 0-click 威胁之下。
4. **防御的有效杠杆是"版本纪律 + 攻击面收敛"**：保持最新系统（紧急补丁当日安装）、对高风险人群启用锁定模式、企业侧做好资产版图与网络管控，即可覆盖绝大多数现实威胁。
5. **趋势判断**：短期（1—2 年）内，入口仍将是消息/解析器，内存安全加固（MIE）将迫使攻击者向硬件与供应链层转移；中长期，配件生态、AI 服务调用链（云端内容解析）可能成为新的研究热点方向。

---

## 9 参考资料

1. Apple 官方安全更新记录：[Apple security releases](https://support.apple.com/en-us/100100)
2. Apple 安全工程博客：[Memory Integrity Enforcement: A complete vision for memory safety](https://security.apple.com/blog/memory-integrity-enforcement/)
3. Apple 公告：[About the security content of iOS 18.4.1 and iPadOS 18.4.1](https://support.apple.com/en-us/122282)
4. Google Project Zero：[A deep dive into an NSO zero-click iMessage exploit: Remote Code Execution（FORCEDENTRY）](https://googleprojectzero.blogspot.com/2021/12/a-deep-dive-into-nso-zero-click.html)
5. Google Project Zero：A Very Deep Dive into iOS Exploit Chains found in the Wild（AWDL，2020）
6. Citizen Lab：[BLASTPASS: NSO Group iPhone Zero-Click, Zero-Day Exploit Captured in the Wild](https://citizenlab.ca/2023/09/blastpass-nso-group-iphone-zero-click-zero-day-exploit-captured-in-the-wild/)
7. Kaspersky GReAT：[The last hardware mystery of Operation Triangulation（CVE-2023-38606）](https://securelist.com/operation-triangulation-the-last-hardware-mystery/111669/)
8. Exodus Intelligence：Broadpwn——Remotely Compromising Android and iOS via a Bug in Broadcom's Wi-Fi Chipsets（2017）
9. KRACK 漏洞官方站点：[Key Reinstallation Attacks](https://www.krackattacks.com/)
10. NVD：[CVE-2023-4863（libwebp）](https://nvd.nist.gov/vuln/detail/CVE-2023-4863)、[CVE-2025-31200（CoreAudio）](https://nvd.nist.gov/vuln/detail/cve-2025-31200)
11. Qualys ThreatProtect：[Apple Warns Users of iOS Vulnerability Exploited in Attack（CVE-2026-86950）](https://threatprotect.qualys.com/2026/09/29/apple-warns-users-ios-vulnerability-exploited-in-attack-cve-2026-86950/)
12. The Hacker News：[Apple Patches CoreGraphics Flaw Possibly Exploited in Targeted Attacks](https://thehackernews.com/2026/09/apple-patches-coregraphics-flaw.html)
13. SOC Prime：[CVE-2026-20700: Apple Patches Zero-Day Exploited in Extremely Sophisticated Attacks](https://socprime.com/blog/cve-2026-20700-vulnerability/)
14. SentinelOne Vulnerability Database：[CVE-2026-20650: Apple OS Bluetooth DoS Vulnerability](https://www.sentinelone.com/vulnerability-database/cve-2026-20650/)
15. CyberInsider：[WhatsApp Flaw Exploited Alongside Apple Zero-Day in Spyware Attacks](https://cyberinsider.com/whatsapp-flaw-exploited-alongside-apple-zero-day-in-spyware-attacks/)
16. Wikipedia：[iOS 27](https://en.wikipedia.org/wiki/IOS_27)

---

*报告结束。本报告基于截至 2026-10-02 的公开信息编制，漏洞评估结论可能随新情报出现而变化，建议定期（建议每季度）复核更新。*
