咨询ios系统请咨询  telegram：
https://t.me/one00190

# iOS Coruna 漏洞利用工具包网络安全分析报告

| 项目 | 内容 |
| --- | --- |
| 报告名称 | iOS Coruna 漏洞利用工具包网络安全分析报告 |
| 报告版本 | V1.0 |
| 编制日期 | 2026-10-03 |
| 情报截止日期 | 2026-10-03 |
| 威胁等级 | **严重（Critical）** |
| 适用对象 | 网络安全人员、企业 IT/安全团队、移动终端管理员、数字资产用户 |

> **术语说明**：Coruna 是 Google Threat Intelligence Group（GTIG）披露的一套 iOS 多版本漏洞利用工具包，不是名为“ios.coruna”的单一漏洞或单一 CVE。其内部包含 5 条完整攻击链和 23 个漏洞利用模块。
>
> **合规声明**：本文仅用于防御性安全研究、风险评估和事件响应，不提供漏洞利用代码或未授权攻击指导。文中 IOC 应在获得授权的网络与终端环境内使用。

---

## 1. 执行摘要

2026 年 3 月，Google Threat Intelligence Group 公开披露名为 **Coruna** 的高级 iOS 漏洞利用工具包。GTIG 在 2025 年先后观察到该工具包被三类不同威胁主体使用：商业监控厂商客户、疑似俄罗斯背景的间谍活动组织 UNC6353，以及以中国为运营来源、具有经济动机的 UNC6691。

Coruna 的主要特点如下：

- 面向 iPhone，完整攻击链覆盖 **iOS 13.0 至 iOS 17.2.1**；
- 包含 **5 条完整攻击链、23 个漏洞利用模块**，其中部分模块无公开 CVE；
- 通过恶意网页、受侵网站隐藏 iframe、虚假金融/博彩/加密货币网站进行投递；
- 自动识别设备型号、芯片和系统版本，然后选择匹配的 WebKit RCE、PAC 绕过、沙箱逃逸、内核提权及 PPL 绕过模块；
- 最终载荷 PLASMAGRID/PlasmaLoader 注入以 root 权限运行的 `powerd`，重点窃取加密货币钱包、助记词、银行账号和图片中的二维码；
- 工具包检测到 iOS 锁定模式或 Safari 无痕浏览时会主动退出；
- GTIG 明确指出，Coruna 对最新 iOS 版本无效，首要防御措施是更新至最新系统；无法更新时应启用锁定模式。

### 1.1 核心风险结论

| 风险项 | 结论 |
| --- | --- |
| 攻击门槛 | 受害者通常需要访问恶意或被入侵的网站；之后可在无额外交互的情况下执行完整攻击链 |
| 影响范围 | iOS 13.0—17.2.1 的完整链最明确；部分独立模块可覆盖到 17.3/17.4，但不代表这些版本均存在可用完整链 |
| 技术影响 | WebKit 代码执行、沙箱逃逸、内核权限提升、PPL 绕过、root 进程注入和敏感数据窃取 |
| 主要目标 | 乌克兰特定用户、虚假金融/博彩网站访问者、加密货币钱包用户、高价值个人和企业终端 |
| 持久化 | 公开材料确认进程注入与远程模块加载，但未充分证明重启后持久化；重启不能代替补丁和事件响应 |
| 综合等级 | **严重**：对未修补设备可造成终端完全失陷及数字资产损失 |

---

## 2. 威胁背景与时间线

### 2.1 发现与扩散过程

| 时间 | 事件 | 证据与判断 |
| --- | --- | --- |
| 2025-02 | GTIG 捕获商业监控厂商某客户使用的部分 iOS 攻击链 | 首次发现相同 JavaScript 框架；可识别设备并投递 CVE-2024-23222 |
| 2025 年夏 | UNC6353 将框架部署于大量被入侵的乌克兰网站 | 通过 `cdn[.]uacounter[.]com` 隐藏 iframe 定向投递，仅向特定地理位置和部分 iPhone 用户提供载荷；GTIG 与 CERT-UA 协作清理 |
| 2025 年末 | UNC6691 在大量中文虚假金融、加密货币和博彩站点部署工具包 | 不再仅限少量高价值目标，而是对访问站点的适配 iOS 设备进行广泛投递 |
| 2026-03-04 | GTIG 公开完整研究 | 披露 5 条攻击链、23 个漏洞利用模块、载荷、哈希、网络 IOC 和 YARA 规则 |
| 2026-03-11 | Apple 向旧设备回补相关修复 | 发布 iOS/iPadOS 15.8.7 与 16.7.15，修复多个与 Coruna 相关的 WebKit/Kernel 问题 |
| 2026-04 | Apple 发布面向普通用户的 Web 攻击防护说明 | 强调更新最新 iOS；不能升级时使用锁定模式作为过渡防护 |

### 2.2 威胁能力扩散判断

GTIG 观察到同一工具包先后被商业监控、疑似国家背景间谍活动和经济犯罪活动使用。这说明高级移动漏洞利用能力可能通过转售、泄露、二手交易或共享链路进入更广泛的攻击生态。

需要注意：

- **已证实**：不同威胁主体使用了相同框架及漏洞组合；
- **未证实**：Coruna 的原始开发者身份、工具包在不同主体间流转的具体方式；
- **合理判断**：存在“二手零日漏洞”或成熟利用链交易市场，但不能据此将所有活动归因于同一组织。

---

## 3. 攻击面与攻击链分析

### 3.1 典型投递路径

```text
恶意链接 / 虚假金融或博彩网站 / 被入侵的正常网站
                    │
                    ▼
             隐藏 iframe 加载
                    │
                    ▼
  设备指纹识别（机型、芯片、iOS 版本、环境检查）
                    │
        ┌───────────┴───────────┐
        │ 锁定模式/无痕浏览     │ 普通浏览环境
        ▼                       ▼
      主动退出          选择对应 WebKit RCE
                                │
                                ▼
                         PAC 绕过 / 任意读写
                                │
                                ▼
                       WebContent 沙箱逃逸
                                │
                                ▼
                    内核提权（Kernel PE）
                                │
                                ▼
                  PPL 绕过 / 内核防护突破
                                │
                                ▼
             PlasmaLoader 注入 root 权限 powerd
                                │
                                ▼
       下载钱包窃密模块 → 收集数据 → 加密回传 C2
```

### 3.2 初始侦察与环境识别

Coruna 的 JavaScript 框架会收集设备指纹，以识别：

- iPhone 型号与 SoC 芯片代际；
- iOS 具体版本；
- 设备是否真实、是否可能为分析环境；
- Safari 是否处于无痕浏览；
- 设备是否开启锁定模式。

框架根据结果选择与版本、芯片匹配的漏洞链。如果发现锁定模式或无痕浏览，工具包会停止运行，这使锁定模式成为可验证的有效缓解措施。

### 3.3 资源定位、加密和封装

| 项目 | 技术特征 |
| --- | --- |
| 资源 URL 生成 | 使用硬编码 Cookie，通过 `SHA-256(COOKIE + ID)` 的前 40 个字符生成资源路径 |
| JavaScript 混淆 | 使用异或、字符映射等方式隐藏字符串和整数 |
| RCE/PAC 模块 | 以未加密形式下发 |
| 二进制载荷路径 | 伪装为以 `.min.js` 结尾的资源 |
| 二进制加密 | 每个数据块使用独立密钥进行 ChaCha20 加密 |
| 自定义封装 | 文件头为 `0xf00dbeef` |
| 压缩算法 | LZW |
| 元数据 | 标明模块类型、支持芯片和 iOS 版本 |

### 3.4 五阶段完整链

1. **WebContent 任意读写/RCE**：通过 WebKit 内存安全漏洞在网页内容进程中获得代码执行或内存读写能力。
2. **PAC 绕过**：针对 ARM 指针认证机制实施版本适配的绕过，为后续控制流劫持创造条件。
3. **WebContent 沙箱逃逸**：突破浏览器内容进程隔离。
4. **内核提权**：利用内核漏洞获得高权限执行能力。
5. **PPL 绕过**：突破 Page Protection Layer 等内核页保护措施，建立稳定的高权限运行环境。

---

## 4. 漏洞与模块清单

以下表格依据 GTIG 2026 年 3 月公开分析整理。GTIG 明确表示部分 CVE 映射仍可能随着根因分析更新，因此应以 Apple 后续公告和 GTIG 更新为准。

| 类型 | 内部代号 | 目标 iOS 版本（含边界） | 已知修复版本 | CVE |
| --- | --- | --- | --- | --- |
| WebContent R/W | buffout | 13 → 15.1.1 | 15.2 | CVE-2021-30952 |
| WebContent R/W | jacurutu | 15.2 → 15.5 | 15.6 | CVE-2022-48503 |
| WebContent R/W | bluebird | 15.6 → 16.1.2 | 16.2 | 无公开 CVE |
| WebContent R/W | terrorbird | 16.2 → 16.5.1 | 16.6 | CVE-2023-43000 |
| WebContent R/W | cassowary | 16.6 → 17.2.1 | 16.7.5、17.3 | CVE-2024-23222 |
| WebContent PAC 绕过 | breezy | 13 → 14.x | 未明确 | 无公开 CVE |
| WebContent PAC 绕过 | breezy15 | 15 → 16.2 | 未明确 | 无公开 CVE |
| WebContent PAC 绕过 | seedbell | 16.3 → 16.5.1 | 未明确 | 无公开 CVE |
| WebContent PAC 绕过 | seedbell_16_6 | 16.6 → 16.7.12 | 未明确 | 无公开 CVE |
| WebContent PAC 绕过 | seedbell_17 | 17 → 17.2.1 | 未明确 | 无公开 CVE |
| WebContent 沙箱逃逸 | IronLoader | 16.0 → 16.3.1；16.4.0（≤A12） | 15.7.8、16.5 | CVE-2023-32409 |
| WebContent 沙箱逃逸 | NeuronLoader | 16.4.0 → 16.6.1（A13—A16） | 17.0 | 无公开 CVE |
| 内核提权 | Neutron | 13.x | 14.2 | CVE-2020-27932 |
| 内核信息泄露 | Dynamo | 13.x | 14.2 | CVE-2020-27950 |
| 内核提权 | Pendulum | 14 → 14.4.x | 14.7 | 无公开 CVE |
| 内核提权 | Photon | 14.5 → 15.7.6 | 15.7.7、16.5.1 | CVE-2023-32434 |
| 内核提权 | Parallax | 16.4 → 16.7 | 17.0 | CVE-2023-41974 |
| 内核提权 | Gruber | 15.2 → 17.2.1 | 16.7.6、17.3 | 无公开 CVE |
| PPL 绕过 | Quark | 13.x | 14.5 | 无公开 CVE |
| PPL 绕过 | Gallium | 14.x | 15.7.8、16.6 | CVE-2023-38606 |
| PPL 绕过 | Carbone | 15.0 → 16.7.6 | 17.0 | 无公开 CVE |
| PPL 绕过 | Sparrow | 17.0 → 17.3 | 16.7.6、17.4 | CVE-2024-23225 |
| PPL 绕过 | Rocket | 17.1 → 17.4 | 16.7.8、17.5 | CVE-2024-23296 |

### 4.1 关键漏洞说明

#### CVE-2024-23222（WebKit）

- 用途：较新版本链的初始 WebKit RCE/内存读写入口；
- Coruna 适配范围：iOS 16.6—17.2.1；
- 修复：iOS 17.3 和旧分支 16.7.5；
- 状态：Apple 在 2024 年修复时已将其描述为可能遭利用的 WebKit 零日漏洞；GTIG 后续在 Coruna 样本中确认了实际利用代码。

#### CVE-2023-32434 与 CVE-2023-38606

- `Photon` 利用 CVE-2023-32434 进行内核提权；
- `Gallium` 利用 CVE-2023-38606 绕过 PPL；
- 两者此前也出现在 Kaspersky 披露的 Operation Triangulation 中，反映高价值利用技术可在不同工具链间复用。

#### 无公开 CVE 的模块

23 个模块中有相当一部分尚未映射到公开 CVE。这意味着：

- 仅使用 CVE 扫描器无法完整评估 Coruna 风险；
- 补丁状态应以“设备是否已升级至 Apple 最新支持版本”为主，而不是逐个比对已知 CVE；
- 企业检测应结合版本、访问日志、IOC、进程行为与用户风险画像。

---

## 5. 最终载荷与数据窃取能力

### 5.1 PLASMAGRID / PlasmaLoader

攻击链末端使用名为 `PlasmaLoader` 的加载器，GTIG 将该植入物跟踪为 **PLASMAGRID**。其使用 `com.apple.assistd` 作为标识，并通过攻击链建立的内核组件进行通信。

PlasmaLoader 会将自身注入 `powerd`。该守护进程在 iOS 中以 root 权限运行，因此攻击者可获得远超普通应用沙箱的访问能力。

### 5.2 主要窃密目标

- 扫描本地图片并解析二维码；
- 检索 Apple 备忘录中的 BIP39 助记词序列；
- 搜索“backup phrase”“bank account”等金融关键词；
- 动态下载并执行额外模块；
- 钩取加密货币钱包应用中的敏感数据和操作；
- 将数据加密后发送至攻击者控制的 C2。

### 5.3 已观察到的目标钱包应用

包括但不限于：

- BitKeep/Bitget Wallet、Bitpie、Coin98；
- Coinbase Wallet、Exodus、imToken；
- MetaMask、Phantom、Trust Wallet、Uniswap；
- TonKeeper、Tonhub、TronLink；
- Solflare、Ronin 等。

对数字资产用户而言，助记词一旦泄露，即使设备后续更新或重置，原钱包仍应视为永久失陷。

### 5.4 C2 通信机制

| 项目 | 观察结果 |
| --- | --- |
| 传输 | HTTPS |
| 应用层数据加密 | AES，密钥由静态字符串的 SHA-256 哈希派生 |
| 特征请求头 | `sdkv`、`x-ts`（后者附带时间戳） |
| 配置路径 | `/details/show.html` |
| 模块分发 | 7-Zip 压缩包，使用硬编码密码保护 |
| C2 容灾 | 内置硬编码 C2 + DGA 备用机制 |
| DGA | 使用字符串 `lazarus` 作为种子，生成 15 字符 `.xyz` 域名，并使用 Google 公共 DNS 检查域名是否生效 |

> DGA 中出现 `lazarus` 字符串不能单独作为 Lazarus Group 归因证据，可能是误导、复用或任意开发者选择。

---

## 6. 影响范围与风险评估

### 6.1 版本影响

| 设备状态 | 风险判断 |
| --- | --- |
| iOS 13.0—17.2.1，未安装相应安全修复 | **严重风险**，存在完整链适配可能 |
| iOS 15 老旧设备但低于 15.8.7 | **严重风险**，需安装 iOS 15.8.7 或退役 |
| iOS 16 老旧设备但低于 16.7.15 | **严重风险**，需安装 iOS 16.7.15 或升级 |
| iOS 17.3 及以上 | 已阻断 GTIG 明确描述的主链，但仍应升级至当前最新受支持版本 |
| 当前最新 iOS | GTIG 表示 Coruna 对最新系统无效；仍需保持自动更新 |
| 无法继续获得补丁的设备 | **不可接受风险**，应停止处理企业数据、钱包助记词和敏感账号 |

### 6.2 旧设备补丁

Apple 于 2026 年 3 月 11 日发布：

- **iOS/iPadOS 15.8.7**：面向 iPhone 6s、iPhone 7、第一代 iPhone SE、iPad Air 2、iPad mini 4、iPod touch 7 等，修复与 Coruna 相关的 CVE-2023-41974、CVE-2024-23222、CVE-2023-43000、CVE-2023-43010；
- **iOS/iPadOS 16.7.15**：面向 iPhone 8、iPhone 8 Plus、iPhone X、iPad 5、早期 iPad Pro 等，回补与 Coruna 相关的 CVE-2023-43010。

### 6.3 CVSS 之外的业务风险

Coruna 是组合攻击链，不能用单个 CVE 的 CVSS 代表整体风险。综合评估如下：

| 维度 | 评级 | 说明 |
| --- | --- | --- |
| 可达性 | 高 | 通过网页、隐藏 iframe 和虚假站点投递 |
| 用户交互 | 中 | 通常需访问或被引导至恶意页面，之后无需安装 App 或确认权限 |
| 技术复杂度 | 高 | 包含版本指纹、PAC 绕过、沙箱逃逸、内核提权和 PPL 绕过 |
| 机密性影响 | 严重 | 助记词、钱包、备忘录、图片、账户数据可被窃取 |
| 完整性影响 | 严重 | 可在 root 进程中注入代码并远程加载模块 |
| 可用性影响 | 中 | 利用失败可能导致 Safari/进程崩溃；主要目的为隐蔽窃密 |
| 规模化能力 | 高 | 已从定向活动扩散到大量虚假站点和广泛访问者 |
| 综合风险 | **严重** | 旧版 iOS 与数字资产用户风险尤为突出 |

---

## 7. 检测与狩猎建议

### 7.1 网络侧检测

建议在 DNS、安全网关、代理、EDR/NDR 和防火墙中监测：

- 访问 GTIG 公布的 Coruna 投递 URL 和 PLASMAGRID C2；
- 大量随机 15 字符 `.xyz` 域名解析；
- 终端在访问金融、博彩或加密货币站点后立即请求 `.min.js` 二进制资源；
- 请求路径 `/details/show.html`；
- 异常 HTTP 请求头 `sdkv`、`x-ts`；
- iPhone 终端通过公共 Google DNS 查询新注册、低信誉 `.xyz` 域名；
- 同一会话中出现多次 Safari/WebContent 崩溃后连接陌生 C2。

### 7.2 终端与日志侧检测

重点检查：

- Safari、WebKit WebContent 进程异常崩溃；
- `powerd` 出现异常网络连接或非预期模块加载行为；
- 与 `com.apple.assistd`、`com.plasma.*` 相关的异常标识；
- `/var/mobile/Library/Preferences/com.plasma.photomonitor.plist` 等可疑路径或字符串；
- `plasma_heartbeat_monitor`、`plasma_injection_dispatcher`、`PLExploitationInterface` 等字符串；
- 访问虚假金融、加密货币、博彩站点后的系统异常、耗电或流量突增。

由于 iOS 对第三方安全软件存在沙箱限制，普通反病毒产品通常无法完整观察 root 进程注入。企业需要结合 MDM 版本合规、网络检测、Apple 威胁通知和专业移动取证能力。

### 7.3 代表性文件 IOC

| 类型 | 标识 | SHA-256 |
| --- | --- | --- |
| 主植入物 | `com.apple.assistd` | `2a9d21ca07244932939c6c58699448f2147992c1f49cd3bc7d067bd92cb54f3a` |
| SpringBoard 模块 | `com.apple.springboard` | `18394fcc096344e0730e49a0098970b1c53c137f679cff5c7ff8902e651cd8a3` |
| BitKeep 模块 | `com.bitkeep.os` | `6eafd742f58db21fbaf5fd7636e6653446df04b4a5c9bca9104e5dfad34f547c` |
| MetaMask 模块 | `io.metamask.MetaMask` | `25a9b004cf61fb251c8d4024a8c7383a86cb30f60aa7d59ca53ce9460fcfb7de` |
| Phantom 模块 | `app.phantom` | `3c297829353778857edfeaed3ceeeca1bf8b60534f1979f7d442a0b03c56e541` |
| Trust Wallet 模块 | `com.sixdays.trust` | `1fb9dedf1de81d387eff4bd5e747f730dd03c440157a66f20fdb5e95f64318c0` |
| Uniswap 模块 | `com.uniswap.mobile` | `4dc255504a6c3ea8714ccdc95cc04138dc6c92130887274c8582b4a96ebab4a8` |

### 7.4 代表性网络 IOC（已去活化）

#### UNC6353 投递地址

```text
hxxp://cdn[.]uacounter[.]com/stat[.]html
```

#### UNC6691 投递地址（节选）

```text
hxxps://ai-scorepredict[.]com/static/analytics[.]html
hxxps://goodcryptocurrency[.]top/details/group[.]html
hxxp://pepeairdrop01[.]com/static/analytics[.]html
hxxps://ios[.]teegrom[.]top/tuiliu/group[.]html
hxxps://iphonex[.]mjdqw[.]cn/tuiliu/group[.]html
hxxps://b27[.]icu/group[.]html
hxxps://3v5w1km5gv[.]xyz/group[.]html
hxxps://www[.]appstoreconn[.]com/xmweb/group[.]html
```

#### PLASMAGRID C2（节选）

```text
vvri8ocl4t3k8n6[.]xyz
rlau616jc7a7f7i[.]xyz
ol67el6pxg03ad7[.]xyz
8fn4957c5g986jp[.]xyz
uawwydy3qas6ykv[.]xyz
xittgveqaufogve[.]xyz
zcjdlb5ubkhy41u[.]xyz
```

> IOC 具有时效性，攻击者可随时更换域名和证书。阻断 IOC 不能代替系统更新。

### 7.5 MITRE ATT&CK 参考映射

| 阶段 | 技术 | 映射 |
| --- | --- | --- |
| 初始访问 | 水坑攻击/恶意网页 | T1189 Drive-by Compromise |
| 客户端执行 | 利用 WebKit 漏洞 | T1203 Exploitation for Client Execution |
| 权限提升 | 内核漏洞利用 | T1068 Exploitation for Privilege Escalation |
| 防御规避 | PAC、沙箱与 PPL 绕过 | T1211 Exploitation for Defense Evasion（参考映射） |
| 执行 | 注入 `powerd` | T1055 Process Injection |
| 收集 | 本地文件、备忘录、图片、钱包数据 | T1005 Data from Local System |
| 凭证访问 | BIP39 助记词/钱包凭证窃取 | T1555 Credentials from Password Stores（近似映射） |
| C2 | DGA 备用域名 | T1568.002 Dynamic Resolution: DGA |
| 外传 | 加密 HTTPS 回传 | T1041 Exfiltration Over C2 Channel |

---

## 8. 防护与整改建议

### 8.1 个人用户

1. **立即更新 iOS**：升级到设备支持的最新正式版本，不应仅停留在 17.3 或旧回补版本。
2. **开启自动更新**：启用 iOS 更新和安全响应自动安装。
3. **旧设备退役**：不能获得最新安全补丁的设备不应继续用于数字资产、企业邮箱、银行或敏感通信。
4. **高风险用户启用锁定模式**：设置 → 隐私与安全性 → 锁定模式。
5. **谨慎访问链接**：不访问来源不明的博彩、空投、加密货币、钱包升级和投资网站。
6. **使用 Safari 无痕模式只能作为附加措施**：Coruna 会退出无痕环境，但这不是通用防护，不能替代更新。
7. **接到 Apple 威胁通知时立即响应**：保留通知和设备证据，联系专业移动安全团队。

### 8.2 数字资产用户

如设备可能遭 Coruna 感染：

1. 在**全新或已确认安全的设备**上创建新钱包；
2. 将资产转移到新生成的地址；
3. 旧助记词、私钥和备份短语应视为永久泄露，不得继续使用；
4. 撤销钱包相关网站授权、API Token、会话及交易权限；
5. 不要只依靠修改钱包 App 密码——助记词泄露后密码修改无法保护链上资产。

### 8.3 企业与组织

| 控制项 | 建议 |
| --- | --- |
| 资产盘点 | 识别所有 iOS 设备、版本、机型、补丁能力及 BYOD 设备 |
| 合规策略 | MDM 强制最低版本；阻断 iOS < 17.3 及无法补丁设备访问企业资源 |
| 补丁 SLA | 在野利用相关更新 24 小时内完成，高风险人员应当日安装 |
| 锁定模式 | 对记者、高管、法务、财务、管理员等高风险人员强制或建议启用 |
| 网络阻断 | 导入 GTIG IOC，监测新注册 `.xyz`、DGA 特征和可疑 `.min.js` 载荷 |
| DNS 安全 | 使用受控 DNS、DoH/DoT 监测与威胁情报过滤；记录 DNS 查询日志 |
| 条件访问 | 将 iOS 版本、设备合规、风险状态纳入零信任访问控制 |
| 钱包隔离 | 禁止企业敏感设备同时存储私人助记词或管理高价值数字资产 |
| 事件响应 | 建立移动终端证据保全、账户吊销和专业取证流程 |

---

## 9. 事件响应流程

发现可疑访问记录、Apple 威胁通知或 IOC 命中时：

### 阶段一：立即控制

1. 将设备从企业 Wi-Fi、VPN 和敏感业务系统中隔离；
2. 不要使用该设备修改密码或迁移钱包；
3. 记录设备型号、iOS 版本、时间、访问 URL、网络环境和告警截图；
4. 在安全设备上撤销 Apple ID、企业 SSO、邮箱、VPN、钱包和交易平台会话。

### 阶段二：证据保全

1. 不要立即恢复出厂设置；
2. 保存 MDM、DNS、防火墙、代理、VPN、身份认证和邮件日志；
3. 在合法授权下采集 sysdiagnose、崩溃日志、Safari 历史和备份；
4. 将日志与 GTIG IOC、YARA 特征及时间线交叉比对。

### 阶段三：清除与恢复

1. 在证据保全后更新至最新 iOS；必要时执行完整恢复；
2. 对无法升级的设备实施永久退役或严格隔离；
3. 从安全设备轮换全部敏感凭证；
4. 数字资产迁移至新助记词生成的钱包；
5. 持续监测旧会话、异常登录、链上转账和钓鱼再攻击。

### 阶段四：复盘

- 确定入口网站、传播渠道和受影响用户范围；
- 检查是否存在同一 URL 经聊天软件、短信或广告批量传播；
- 更新 URL/DNS 阻断策略、MDM 合规基线和用户培训内容；
- 对受影响员工及相邻资产进行扩大排查。

---

## 10. 结论

Coruna 的危险不在于某一个 CVE，而在于它将跨越数代 iPhone 和 iOS 的漏洞、利用框架、缓解绕过及金融窃密载荷组合成可自动适配的工业化工具包。其从商业监控和定向间谍活动扩散到虚假金融、博彩和加密货币网站，说明高级移动利用能力正在向更广泛的经济犯罪生态外溢。

对于防御方，最有效的控制措施仍然明确：

- 将设备升级至最新 iOS；
- 退役不再受支持的设备；
- 高风险人员启用锁定模式；
- 结合 MDM、DNS/网络检测和专业移动取证，而不是仅依赖传统防病毒；
- 对疑似受影响的钱包助记词和账户凭证按“已泄露”处置。

**最终风险判定：严重（Critical）。**

---

## 11. 参考资料

1. Google Threat Intelligence Group：[Coruna: The Mysterious Journey of a Powerful iOS Exploit Kit](https://cloud.google.com/blog/topics/threat-intelligence/coruna-powerful-ios-exploit-kit)
2. Apple Support：[About the security content of iOS 15.8.7 and iPadOS 15.8.7](https://support.apple.com/en-us/126632)
3. Apple Support：[About the security content of iOS 16.7.15 and iPadOS 16.7.15](https://support.apple.com/en-us/126646)
4. Apple Support：[Update iOS to protect your iPhone from web attacks](https://support.apple.com/en-us/126776)
5. GTIG / VirusTotal：[Coruna IOC Collection](https://www.virustotal.com/gui/collection/8f6035fed41b481f604ad0336a637dce1ddaec6670e1497f38d4fca246fda4ce)
6. iVerify：[Coruna iOS Exploit: How to Detect and Prevent Infection](https://www.iverify.com/blog/coruna-ios-exploit-how-to-detect-and-prevent-infection)
7. Zimperium：[Coruna iOS Exploit Kit Highlights the Need for Multi-Layer Mobile Defense](https://zimperium.com/blog/coruna-ios-exploit-kit-highlights-the-need-for-multi-layer-mobile-defense)
8. Malwarebytes：[Apple patches Coruna exploit kit flaws for older iOS versions](https://www.malwarebytes.com/blog/news/2026/03/apple-patches-coruna-exploit-kit-flaws-for-older-ios-versions)
9. Help Net Security：[Coruna: Spy-grade iOS exploit kit powering financial crime](https://www.helpnetsecurity.com/2026/03/03/coruna-ios-exploit-kit/)
10. Kaspersky Securelist：[Operation Triangulation](https://securelist.com/operation-triangulation/109842/)

---

*报告结束。本报告基于截至 2026-10-03 的公开情报编制。由于 GTIG 的根因分析仍可能更新，CVE 映射、基础设施及检测指标应定期复核。*
