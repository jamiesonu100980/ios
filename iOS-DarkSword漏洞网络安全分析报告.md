咨询ios系统请咨询  telegram：
https://t.me/one00190

# iOS DarkSword 漏洞利用链网络安全分析报告

| 项目 | 内容 |
| --- | --- |
| 报告名称 | iOS DarkSword 漏洞利用链网络安全分析报告 |
| 报告版本 | V1.0 |
| 编制日期 | 2026-10-03 |
| 情报截止日期 | 2026-10-03 |
| 威胁等级 | **严重（Critical）** |
| 适用对象 | 网络安全人员、移动终端管理员、企业 IT 团队、高风险 iPhone 用户 |

> **术语说明**：DarkSword 是一条由多个漏洞组成的 iOS 全链利用框架，并不是名为“ios.darksword”的单一漏洞或单一 CVE。Google Threat Intelligence Group（GTIG）确认其使用 6 个漏洞，覆盖 iOS 18.4—18.7，可实现从恶意网页访问到内核权限控制的完整攻击。
>
> **合规声明**：本报告仅用于防御性安全研究、风险评估和事件响应，不包含漏洞利用代码或未授权攻击指导。IOC 和检测规则只能在合法授权环境中使用。

---

## 1. 执行摘要

2026 年 3 月，Google Threat Intelligence Group 公开披露名为 **DarkSword** 的高级 iOS 全链漏洞利用框架。该框架至少自 2025 年 11 月开始活跃，已被多个商业监控厂商客户和疑似国家背景攻击组织采用，针对沙特阿拉伯、土耳其、马来西亚和乌克兰用户开展攻击。

DarkSword 主要针对运行 **iOS 18.4—18.7** 的 iPhone，利用 6 个漏洞完成以下攻击链：

```text
恶意网页投递
    ↓
JavaScriptCore 远程代码执行
    ↓
dyld PAC 绕过
    ↓
WebContent → GPU 进程沙箱逃逸
    ↓
GPU 进程 → mediaplaybackd 横向突破
    ↓
XNU 内核提权
    ↓
以内核权限运行最终窃密载荷
```

DarkSword 的核心风险包括：

- 访问恶意网页或被入侵网站即可触发攻击；
- 利用链使用纯 JavaScript 实现，不需要安装恶意 App；
- 可突破 Safari WebContent、GPU 进程和系统服务多层沙箱；
- 最终载荷能够窃取消息、邮箱、账号、钥匙串、位置、照片、Wi-Fi 密码和加密货币钱包数据；
- 可截图、录音、下载文件、执行任意 JavaScript，并删除崩溃日志隐藏痕迹；
- 同一利用链已在多个不同攻击主体之间扩散，显示高级移动攻击能力正在商业化流转。

GTIG 于 2025 年末向 Apple 报告相关漏洞。所有漏洞在 **iOS 26.3** 发布时均已得到修复，其中多数漏洞此前已在 iOS 18.6、18.7.2、18.7.3、iOS 26.1 或 26.2 中修复。

### 1.1 综合风险结论

| 风险维度 | 结论 |
| --- | --- |
| 攻击入口 | 恶意网页、仿冒网站、受侵网站隐藏 iframe、水坑攻击 |
| 用户交互 | 通常需要访问页面；后续利用无需安装 App 或批准权限 |
| 影响版本 | iOS 18.4—18.7 |
| 技术影响 | 远程代码执行、PAC 绕过、双层沙箱逃逸、内核提权、数据窃取 |
| 目标范围 | 高价值个人、政务/商业目标及被水坑网站覆盖的普通用户 |
| 最终载荷 | GHOSTKNIFE、GHOSTSABER、GHOSTBLADE |
| 修复状态 | 所有已知漏洞在 iOS 26.3 中完成修复；应更新至最新受支持版本 |
| 综合等级 | **严重（Critical）** |

---

## 2. 威胁背景与活动时间线

### 2.1 时间线

| 时间 | 事件 |
| --- | --- |
| 2025-11 初 | GTIG 发现 UNC6748 使用 Snapchat 仿冒网站 `snapshare[.]chat` 针对沙特阿拉伯用户 |
| 2025-11 | UNC6748 多次更新投递框架，增加 iOS 18.6/18.7 支持、反调试与混淆能力 |
| 2025-11 下旬 | 土耳其商业监控厂商 PARS Defense 在土耳其使用 DarkSword，并采用更强的加密和操作安全措施 |
| 2025-12 起 | 疑似俄罗斯间谍组织 UNC6353 在被入侵的乌克兰网站中部署 DarkSword 水坑攻击 |
| 2026-01 | GTIG 发现 PARS Defense 另一客户在马来西亚使用 DarkSword |
| 2026-02-11 | Apple 发布 iOS/iPadOS 26.3，修复最后一个关键漏洞 CVE-2026-20700 |
| 2026-03 | UNC6353 的乌克兰水坑攻击仍在活动，GTIG 与 CERT-UA 协作处置 |
| 2026-03-19 | GTIG 联合 Lookout、iVerify 公开 DarkSword 技术分析与 IOC |

### 2.2 已知威胁主体

| 主体 | 类型 | 目标/地区 | 最终载荷 |
| --- | --- | --- | --- |
| UNC6748 | GTIG 跟踪的未知威胁集群 | 沙特阿拉伯用户；Snapchat 仿冒站点 | GHOSTKNIFE |
| PARS Defense | 土耳其商业监控厂商 | 土耳其、马来西亚 | GHOSTSABER |
| UNC6353 | 疑似俄罗斯背景间谍组织 | 乌克兰用户；受侵网站水坑攻击 | GHOSTBLADE |

### 2.3 归因边界

以下结论需要严格区分：

- **已证实**：不同攻击主体使用了高度一致的 DarkSword 攻击链；
- **已证实**：PARS Defense 的活动具备更强的代码混淆、设备指纹和加密投递能力；
- **GTIG 评估**：各主体可能在 DarkSword 开发者提供的基础投递逻辑上进行了定制；
- **尚未证实**：DarkSword 的原始开发者、销售方，以及各主体获得该框架的具体渠道；
- **不能推断**：不同主体使用同一工具，不代表它们属于同一组织或共享相同任务目标。

---

## 3. DarkSword 攻击链分析

### 3.1 初始访问

DarkSword 主要使用三类投递方式：

1. **仿冒网站**：如模仿 Snapchat 的社交页面，引诱目标访问；
2. **商业监控投递基础设施**：根据设备指纹、位置和访问条件选择性下发利用代码；
3. **水坑攻击**：入侵目标群体常访问的正常网站，嵌入隐藏 JavaScript 和 iframe。

典型流程为：

```text
用户访问网页
  → 页面检查是否为 iPhone/Safari
  → 设置 sessionStorage 键 uid，避免重复感染
  → 动态创建隐藏 iframe
  → 加载 frame.html
  → 加载 rce_loader.js
  → 根据 iOS 版本下发对应 RCE 模块
```

部分 UNC6748 页面在检测到 Chrome 时使用 `x-safari-https` 协议尝试强制在 Safari 中打开攻击页面，说明该时期攻击者主要依赖 Safari/WebKit 攻击链。

### 3.2 设备指纹与反分析

观察到的环境判断包括：

- 是否为 iPhone 和触摸屏设备；
- Apple Pay、WebGL2、画中画等 API 能力；
- 是否存在 Chrome 或 Firefox 特征；
- CSS 特性和设备输入信息；
- 调试器检测；
- iOS 具体版本。

不符合攻击条件的访问者会被重定向到正常网站，以降低暴露概率。

### 3.3 远程代码执行

DarkSword 使用两套 JavaScriptCore 漏洞：

- iOS 18.4—18.5.x：主要使用 CVE-2025-31277；
- iOS 18.6—18.7：使用 CVE-2025-43529；
- 两者均与 CVE-2026-20700 组合，用于绕过用户态 PAC 并执行任意代码。

利用模块通过 Web Worker 运行，并建立 `fakeobj`、`addrof`、任意内存读写等利用原语。

### 3.4 双层沙箱逃逸

Safari 使用多层进程隔离降低网页漏洞的影响。DarkSword 依次突破：

1. **WebContent → GPU 进程**：利用 ANGLE 中的 CVE-2025-14174，通过 WebGL 操作触发 GPU 进程越界内存访问；
2. **GPU 进程 → mediaplaybackd**：利用 XNU 的 CVE-2025-43510，在权限更高的 `mediaplaybackd` 中建立任意函数调用能力。

### 3.5 内核提权

最终的 `pe_main.js` 利用 CVE-2025-43520。该漏洞位于 XNU 虚拟文件系统（VFS）实现，是内核态竞态条件，可用于构建物理和虚拟内存读写能力。

成功后，最终载荷能够以内核级权限执行。

### 3.6 纯 JavaScript 架构

与 Coruna 不同，DarkSword 的所有利用阶段和已观察最终载荷均使用 JavaScript。其优势包括：

- 不需要投递未签名 Mach-O 可执行文件；
- 降低对 PPL/SPTM 代码签名绕过的需求；
- 利用 JavaScriptCore 运行时与系统 IPC 完成高权限操作；
- 更容易通过网页动态更新不同阶段代码。

其不足是部分投递器逻辑较粗糙，例如错误选择 iOS 版本对应模块，显示使用者或供应商更新流程并不完全成熟。

---

## 4. 六个漏洞详细分析

| 攻击阶段 | 模块 | CVE | 漏洞类型 | 零日利用 | 修复版本 |
| --- | --- | --- | --- | --- | --- |
| WebKit RCE | `rce_module.js` | CVE-2025-31277 | JavaScriptCore JIT 优化/类型混淆导致内存破坏 | 否 | iOS 18.6 |
| PAC 绕过 | `rce_worker_18.4.js` 等 | CVE-2026-20700 | dyld 用户态 PAC 绕过/内存破坏 | 是 | iOS 26.3 |
| WebKit RCE | `rce_worker_18.6.js`、`rce_worker_18.7.js` | CVE-2025-43529 | JavaScriptCore DFG JIT 垃圾回收缺陷/UAF | 是 | iOS 18.7.3、26.2 |
| WebContent 沙箱逃逸 | `sbox0_main_18.4.js`、`sbx0_main.js` | CVE-2025-14174 | ANGLE 参数校验不足导致 GPU 进程越界内存操作 | 是 | iOS 18.7.3、26.2 |
| GPU 沙箱逃逸 | `sbx1_main.js` | CVE-2025-43510 | XNU 写时复制内存管理缺陷 | 否 | iOS 18.7.2、26.1 |
| 内核提权 | `pe_main.js` | CVE-2025-43520 | XNU VFS 内核竞态/内存破坏 | 否 | iOS 18.7.2、26.1 |

### 4.1 CVE-2025-31277

- 组件：JavaScriptCore/WebKit；
- 根因：JIT 优化过程中的类型混淆或内存处理缺陷；
- 影响：处理恶意网页内容可导致内存破坏，并形成浏览器上下文 RCE；
- DarkSword 用途：针对 iOS 18.6 之前版本建立初始任意读写能力；
- Apple 修复：iOS/iPadOS 18.6。

### 4.2 CVE-2025-43529

- 组件：JavaScriptCore/WebKit；
- 根因：DFG JIT 层垃圾回收相关 use-after-free；
- 影响：恶意网页内容可能导致任意代码执行；
- DarkSword 用途：针对 iOS 18.6—18.7 的初始 RCE；
- 利用状态：Apple 确认该漏洞可能被用于针对特定个人的极其复杂攻击；
- Apple 修复：iOS 18.7.3、iOS 26.2。

### 4.3 CVE-2026-20700

- 组件：`dyld` 动态链接器；
- 影响：具备内存写入能力的攻击者可进一步执行任意代码；
- DarkSword 用途：用户态指针认证码（PAC）绕过；
- 利用状态：Apple 确认可能被用于针对特定个人的极其复杂攻击；
- 修复方式：改进状态管理，解决内存破坏问题；
- Apple 修复：iOS/iPadOS 26.3（2026-02-11）。

### 4.4 CVE-2025-14174

- 组件：ANGLE/WebKit GPU 处理链；
- 根因：特定 WebGL 操作参数验证不足；
- 影响：在 Safari GPU 进程内造成越界内存操作和任意代码执行；
- DarkSword 用途：从 WebContent 沙箱进入权限更高的 GPU 进程；
- 利用状态：Apple 确认被用于高级定向攻击；
- Apple 修复：iOS 18.7.3、iOS 26.2。

### 4.5 CVE-2025-43510

- 组件：XNU 内核；
- 根因：写时复制（copy-on-write）相关内存管理缺陷；
- 影响：恶意应用可能导致进程间共享内存发生非预期更改；
- DarkSword 用途：从 GPU 进程跨越到 `mediaplaybackd`，建立任意函数调用原语；
- Apple 修复：iOS 18.7.2、iOS 26.1。

### 4.6 CVE-2025-43520

- 组件：XNU 内核 VFS；
- 根因：竞态条件和内存处理缺陷；
- 影响：恶意应用可导致系统异常终止或写入内核内存；
- DarkSword 用途：建立物理/虚拟内存任意读写并获得内核权限；
- Apple 修复：iOS 18.7.2、iOS 26.1。

---

## 5. 最终载荷分析

### 5.1 GHOSTKNIFE

GHOSTKNIFE 是 UNC6748 使用的 JavaScript 后门，主要能力包括：

- 窃取登录账号、消息和浏览器数据；
- 收集位置历史和录音；
- 截图及麦克风录音；
- 从 C2 下载文件；
- 动态更新配置；
- 使用基于 ECDH 和 AES 的自定义协议进行加密通信；
- 定期删除 WebKit、SpringBoard、`mediaplaybackd` 和内核 panic 崩溃日志。

运行期间会在以下模式的临时目录写入数据：

```text
/tmp/<UUID>.<数字>/STORAGE/
/tmp/<UUID>.<数字>/DATA/
/tmp/<UUID>.<数字>/TMP/
```

### 5.2 GHOSTSABER

GHOSTSABER 与 PARS Defense 活动相关，支持：

- 设备和账号枚举；
- 已安装 App 列表收集；
- 文件及目录递归枚举；
- 执行任意 SQLite 查询并回传结果；
- 窃取照片缩略图和指定 App 全部文件；
- 按正则表达式搜索文件；
- 执行任意 JavaScript；
- 与 C2 通过 HTTP/HTTPS 通信。

样本中还存在位置、截图、Wi-Fi 信息和录音命令，但部分功能在已分析代码中没有直接实现。GTIG 推测后续二进制模块可能通过共享内存实现这些命令，该结论尚未完全证实。

### 5.3 GHOSTBLADE

GHOSTBLADE 是 UNC6353 在乌克兰水坑攻击中使用的数据窃取器。它不具备 GHOSTKNIFE/GHOSTSABER 的持续后门和插件能力，但可一次性收集大量数据：

| 类别 | 数据类型 |
| --- | --- |
| 通信 | iMessage、Telegram、WhatsApp、邮件索引、通话记录、联系人 |
| 身份与访问 | 设备/账号标识、登录账号、钥匙串、SIM 信息、设备描述文件 |
| 位置与网络 | 位置历史、已保存 Wi-Fi 网络及密码、查找功能配置 |
| 个人内容 | 照片元数据、隐藏照片、截图、iCloud Drive、备忘录、日历 |
| 金融数据 | 加密货币钱包数据 |
| 浏览与行为 | Safari 历史、书签、Cookie、健康数据库、个性化数据 |
| 系统信息 | 已安装 App、备份配置、蜂窝数据、App Store 偏好 |

GHOSTBLADE 会删除系统诊断目录中的崩溃报告，以减少取证痕迹。

---

## 6. DarkSword 与 Coruna 对比

| 维度 | DarkSword | Coruna |
| --- | --- | --- |
| 覆盖版本 | iOS 18.4—18.7 | iOS 13.0—17.2.1 |
| 漏洞数量 | 6 个 | 23 个模块、5 条完整链 |
| 技术架构 | 各阶段和最终载荷均为纯 JavaScript | JavaScript 框架 + 加密二进制载荷 |
| 投递成熟度 | 部分加载逻辑存在版本判断错误 | 框架工程化程度更高、版本适配更广 |
| PPL/SPTM 绕过 | 无需单独绕过，利用 JS 运行时执行 | 包含多个 PPL 绕过模块 |
| 最终目标 | 间谍监控、设备数据全面窃取 | 后期活动重点窃取加密钱包和金融数据 |
| 已知共同使用者 | UNC6353 | UNC6353 |
| 核心风险 | 较新 iOS 版本上的高级全链利用 | 横跨多年旧版 iOS 的多链工具包 |

两者被不同类型攻击者复用，反映商业监控漏洞能力可能向国家背景组织和犯罪生态扩散。

---

## 7. 影响范围与风险评估

### 7.1 版本风险

| 设备版本 | 风险判断 |
| --- | --- |
| iOS 18.4—18.5.x | 存在 CVE-2025-31277 主链适配，风险严重 |
| iOS 18.6—18.7 | 存在 CVE-2025-43529 主链适配，风险严重 |
| iOS 18.7.2 | 已修复两个内核漏洞，但仍缺少 18.7.3 的 WebKit/ANGLE 修复 |
| iOS 18.7.3 | 已修复 CVE-2025-43529、CVE-2025-14174，但仍应升级最新版本 |
| iOS 26.1/26.2 | 分阶段修复多个漏洞，但 CVE-2026-20700 最晚在 26.3 修复 |
| iOS 26.3 及以上 | 已修复 GTIG 确认的全部 DarkSword 漏洞；仍应保持最新 |
| 无法升级的设备 | 高风险，应启用锁定模式并限制敏感业务访问，尽快退役 |

### 7.2 业务风险矩阵

| 风险项 | 可能性 | 影响 | 评级 |
| --- | --- | --- | --- |
| 恶意网页初始感染 | 中—高 | 严重 | **严重** |
| 消息/账号数据窃取 | 高（成功感染后） | 严重 | **严重** |
| 钥匙串与 Wi-Fi 密码泄露 | 高（GHOSTBLADE） | 严重 | **严重** |
| 麦克风录音与位置监控 | 中—高 | 高 | **高** |
| 加密钱包数据泄露 | 中—高 | 严重 | **严重** |
| 企业会话和 SSO 泄露 | 中 | 严重 | **严重** |
| 取证痕迹清除 | 高 | 高 | **高** |

---

## 8. 检测与威胁狩猎

### 8.1 网络 IOC

以下指标均已去活化：

| IOC | 关联主体 | 用途 |
| --- | --- | --- |
| `snapshare[.]chat` | UNC6748 | 沙特阿拉伯 DarkSword 投递 |
| `62.72.21[.]10` | UNC6748 | GHOSTKNIFE C2（2025-11） |
| `72.60.98[.]48` | UNC6748 | GHOSTKNIFE C2（2025-11） |
| `sahibndn[.]io` | PARS Defense | 土耳其 DarkSword 投递 |
| `e5[.]malaymoil[.]com` | PARS Defense | 马来西亚 DarkSword 投递 |
| `static[.]cdncounter[.]net` | UNC6353 | 乌克兰水坑攻击投递 |
| `sqwas[.]shapelie[.]com` | UNC6353 | GHOSTBLADE 数据外传服务器 |

### 8.2 文件 IOC

| 类型 | SHA-256 |
| --- | --- |
| GHOSTBLADE 样本 | `2e5a56beb63f21d9347310412ae6efb29fd3db2d3a3fc0798865a29a3c578d35` |

### 8.3 行为检测线索

- 网页动态加载 `frame.html`、`rce_loader.js`、`rce_worker_18.4.js`、`rce_worker_18.6.js` 或 `rce_worker_18.7.js`；
- 页面使用 `uid` sessionStorage 键控制重复感染；
- 使用 `x-safari-https` 从其他浏览器跳转 Safari；
- 隐藏 iframe 尺寸为 0 或 1 像素，定位到屏幕外；
- Safari WebContent、GPU、SpringBoard、`mediaplaybackd` 异常崩溃；
- 大量崩溃日志突然被删除；
- `/tmp/<UUID>.<数字>/STORAGE/` 等临时路径出现异常文件；
- `/private/var/tmp/wifi_passwords.txt` 或 `wifi_passwords_securityd.txt` 等可疑路径；
- `powerd`、`mediaplaybackd` 或 WebKit 进程出现异常外联；
- 设备访问已知投递域名后连接陌生 HTTP/HTTPS C2。

### 8.4 关键检测字符串

可在合法取证样本中搜索：

```text
server_pub_ex
client_pri_ds
send_command_to_upper_process
ChangeStatusCheckSleepInterval
sendDeviceInfoJson
/private/var/tmp/wifi_passwords.txt
X-Device-UUID:
src/InjectJS.js
src/libs/Chain/Native.js
src/MigFilterBypassThread.js
```

> 单个字符串命中不能单独确认感染，需要结合文件哈希、进程、网络行为、时间线和设备版本综合判断。

### 8.5 MITRE ATT&CK 参考映射

| 攻击阶段 | 技术 | 映射 |
| --- | --- | --- |
| 初始访问 | 恶意网页/水坑攻击 | T1189 Drive-by Compromise |
| 执行 | 利用 JavaScriptCore 漏洞 | T1203 Exploitation for Client Execution |
| 权限提升 | XNU 内核漏洞 | T1068 Exploitation for Privilege Escalation |
| 防御规避 | PAC/沙箱绕过、删除崩溃日志 | T1070 Indicator Removal、T1211 Exploitation for Defense Evasion |
| 收集 | 消息、照片、位置、钥匙串、钱包数据 | T1005 Data from Local System |
| 凭证访问 | 钥匙串、Wi-Fi 密码、账号数据 | T1555 Credentials from Password Stores |
| 音频采集 | 麦克风录音 | T1123 Audio Capture |
| 屏幕采集 | 截图 | T1113 Screen Capture |
| C2 | HTTP/HTTPS、自定义加密协议 | T1071.001 Web Protocols、T1573 Encrypted Channel |
| 外传 | 经 C2 服务器上传数据 | T1041 Exfiltration Over C2 Channel |

---

## 9. 防护与整改建议

### 9.1 个人用户

1. **升级至最新 iOS 版本**，至少确保高于 iOS 26.3；实际操作应安装设备当前提供的最新正式版本。
2. 开启“设置 → 通用 → 软件更新 → 自动更新”中的所有更新选项。
3. 高风险用户开启“设置 → 隐私与安全性 → 锁定模式”。
4. 不打开陌生短信、社交媒体私信中的所谓照片分享、钱包、投资或紧急通知链接。
5. 避免在旧 iPhone 上保存钱包助记词、企业账号或敏感通信数据。
6. 收到 Apple 威胁通知时，不要忽略，应立即联系专业安全人员。

### 9.2 企业与组织

| 控制项 | 建议 |
| --- | --- |
| 版本合规 | MDM 强制 iOS 26.3 以上；更优做法是要求当前最新版本 |
| 补丁时限 | Apple 标注在野利用的更新应在 24 小时内完成 |
| 条件访问 | 阻止不合规、越狱、长期不更新设备访问企业资源 |
| 锁定模式 | 对高管、政务、法务、记者、管理员等高风险人员强制启用 |
| DNS/网关 | 阻断已知 IOC、新注册可疑域名和低信誉投递基础设施 |
| 浏览防护 | 启用 Safe Browsing、URL 重写检测、聊天链接沙箱分析 |
| 日志保留 | 保留 DNS、代理、VPN、SSO、MDM 和邮件日志，支持回溯分析 |
| BYOD | 未纳管设备不得访问高价值数据或保存长期会话 |
| 响应能力 | 建立 iOS sysdiagnose、备份和专业移动取证流程 |

### 9.3 高风险人群

- 工作与个人设备、号码和 Apple ID 分离；
- 使用锁定模式并减少 Safari 暴露面；
- 不在同一设备同时处理敏感通信和数字资产；
- 重要账户使用抗钓鱼 MFA/安全密钥；
- 定期检查 Apple 威胁通知、登录会话和设备列表；
- 对异常崩溃、重启、耗电和流量变化及时报备，但不能仅凭这些现象判断感染。

---

## 10. 事件响应流程

### 10.1 发现疑似感染时

1. 立即将设备从企业 Wi-Fi、VPN 和敏感系统隔离；
2. 不要使用可疑设备修改密码或迁移钱包；
3. 记录设备型号、iOS 版本、时间、URL、来源消息和告警截图；
4. 在安全设备上撤销 Apple ID、企业 SSO、邮箱、VPN 和云服务会话；
5. 对数字资产采取紧急转移措施，并使用全新助记词。

### 10.2 证据保全

- 在恢复出厂设置前采集 sysdiagnose、崩溃日志和合法授权的备份；
- 保存 DNS、代理、防火墙、邮件、身份认证和 MDM 日志；
- 搜索已知 IOC、`uid` 会话投递特征和异常 WebKit 崩溃；
- 检查是否存在同一链接向多人传播或水坑站点共同访问记录。

### 10.3 清除与恢复

1. 完成证据保全后升级至最新 iOS；
2. 高置信度失陷设备建议执行完整恢复，而不是只重启；
3. 轮换所有可能暴露的密码、令牌、证书和密钥；
4. 钱包助记词、Wi-Fi 密码和钥匙串凭证按已泄露处理；
5. 对关联账号持续监控异常登录、资金转移和会话重放。

> DarkSword 载荷会删除部分崩溃日志。没有发现日志不能证明设备未被感染。

---

## 11. 结论

DarkSword 是针对较新 iOS 版本的高端全链利用框架。它通过 6 个漏洞将网页级代码执行、PAC 绕过、两层沙箱逃逸和内核提权连接起来，并投递具备广泛监控和数据窃取能力的 GHOSTKNIFE、GHOSTSABER 和 GHOSTBLADE。

其最大安全意义包括：

1. 高级移动利用能力已在商业监控厂商、未知攻击集群和疑似国家背景组织之间扩散；
2. 单次网页访问即可触发完整攻击链，不需要安装 App；
3. 纯 JavaScript 架构降低了传统文件检测的可见性；
4. 最终载荷可窃取钥匙串、消息、位置、Wi-Fi 密码、钱包和企业账号数据；
5. 删除崩溃日志等反取证行为增加了事件调查难度。

**最终风险判定：严重（Critical）。**

最有效的防护措施是将所有设备更新到最新受支持的 iOS；无法及时更新的高风险用户应立即启用锁定模式，并限制旧设备访问敏感业务。

---

## 12. 参考资料

1. Google Threat Intelligence Group：[The Proliferation of DarkSword: iOS Exploit Chain Adopted by Multiple Threat Actors](https://cloud.google.com/blog/topics/threat-intelligence/darksword-ios-exploit-chain)
2. Apple Support：[About the security content of iOS 26.3 and iPadOS 26.3](https://support.apple.com/en-us/126346)
3. Apple Support：[About the security content of iOS 26.2 and iPadOS 26.2](https://support.apple.com/en-us/125884)
4. Apple Support：[About the security content of iOS 18.7.3 and iPadOS 18.7.3](https://support.apple.com/en-us/125885)
5. Apple Support：[About the security content of iOS 18.7.2 and iPadOS 18.7.2](https://support.apple.com/en-us/125633)
6. Apple Support：[About the security content of iOS 18.6 and iPadOS 18.6](https://support.apple.com/en-md/124147)
7. Apple Support：[Update iOS to protect your iPhone from web attacks](https://support.apple.com/en-us/126776)
8. GTIG / VirusTotal：[DarkSword IOC Collection](https://www.virustotal.com/gui/collection/bd631d6c4cec1759bc298b8da180d9ed1d7d89475376bc614176c3541460f40c/summary)
9. iVerify：[Inside DarkSword: A New iOS Exploit Kit Delivered Via Watering Holes](https://www.iverify.com/blog/darksword-ios-exploit-kit-explained)
10. FortiGuard Labs：[DarkSword iOS Exploit Chain](https://www.fortiguard.com/threat-signal-report/6389/darksword-ios-exploit-chain)
11. Help Net Security：[DarkSword: Researchers uncover another iOS exploit kit](https://www.helpnetsecurity.com/2026/03/19/darksword-ios-exploit-iphone/)

---

*报告结束。本报告基于截至 2026-10-03 的公开资料编制。漏洞映射、基础设施和 IOC 可能持续变化，应定期结合 Apple 与 GTIG 最新公告复核。*
