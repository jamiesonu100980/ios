# DarkSword 完整技术报告——现代 iOS 六漏洞全链攻击、浏览器沙箱与内核安全研究

**报告类型**：iOS 安全研究

**研究对象**：DarkSword

**公开披露**：2026 年 3 月 18 日

**核心研究机构**：Google Threat Intelligence Group（GTIG）、Lookout、iVerify

**研究重点**：JavaScriptCore、PAC、dyld、ANGLE、iOS Sandbox、XNU Kernel

**安全范围说明**：本报告用于漏洞研究、威胁情报和防御分析。对攻击链只描述公开报告中的架构、漏洞角色和安全边界，不提供能够直接攻击真实 iPhone 的 exploit 代码、payload 或逐步利用操作。

---

## 一、执行摘要

DarkSword 是 Google Threat Intelligence Group 在 2026 年公开披露的一条 iOS full-chain exploit。

GTIG 表示，DarkSword 至少从 2025 年 11 月开始被多个商业监控软件供应商及疑似国家背景攻击者使用，目标涉及沙特阿拉伯、土耳其、马来西亚和乌克兰用户。

公开分析显示，DarkSword 针对 iOS 18.4～18.7 的特定版本组合，使用 6 个漏洞组成完整攻击链，并最终在受影响设备上运行具有较高权限的最终载荷。GTIG 同时识别出 GHOSTBLADE、GHOSTKNIFE 和 GHOSTSABER 三个相关恶意软件家族。

从架构角度看，可以将 DarkSword 抽象为：

```text
Web 页面
  ↓
JavaScriptCore RCE
  ↓
用户态 PAC / dyld 阶段
  ↓
WebContent → GPU 沙箱逃逸
  ↓
GPU → mediaplaybackd
  ↓
XNU Kernel
  ↓
最终 JavaScript Payload
```

这个结构非常重要，因为它展示了现代 iOS exploit chain 的核心思想：不是依赖一个"万能漏洞"，而是把多个权限边界上的漏洞串联起来。

---

## 二、DarkSword 的发现过程

GTIG 最早在 2025 年 11 月观察到 DarkSword 相关活动。

其中一组活动来自被 GTIG 跟踪为 UNC6748 的威胁集群。攻击者建立了一个仿冒 Snapchat 的网站，并通过网页 JavaScript 加载后续 exploit。

之后 GTIG 又发现：

- 土耳其相关活动；
- 马来西亚相关活动；
- 乌克兰水坑攻击活动；
- 不同攻击者使用不同版本的 loader；
- 同一套漏洞利用能力对应不同的最终恶意软件。

这也是 DarkSword 最值得研究的地方之一。它并非只服务于单一攻击组织。

GTIG 认为，不同攻击者使用的投放逻辑存在明显共同基础，说明 DarkSword 的核心 exploit 能力与最终运营者之间存在一定程度的分离。这与此前 Coruna 的传播现象非常类似。

---

## 三、DarkSword 六漏洞攻击链

GTIG 公开的核心漏洞表如下：

| 阶段 | CVE | 组件 | 类型 | 主要作用 |
| --- | --- | --- | --- | --- |
| RCE | CVE-2025-31277 | JavaScriptCore | 内存破坏 | 浏览器代码执行入口 |
| RCE | CVE-2025-43529 | JavaScriptCore | 内存破坏 | 新版本 RCE |
| PAC | CVE-2026-20700 | dyld | 用户态 PAC 绕过 | 配合后续阶段执行 |
| Sandbox | CVE-2025-14174 | ANGLE | 内存破坏 | WebContent → GPU |
| Sandbox/Kernel | CVE-2025-43510 | XNU | 内存管理 | 后续权限扩展 |
| Kernel | CVE-2025-43520 | XNU | 内存破坏/竞态 | 内核阶段 |

这些漏洞并不是全部同时使用。

DarkSword 会根据目标 iOS 版本选择相应的 RCE 模块。例如，GTIG 观察到：

- iOS 18.6 之前使用 CVE-2025-31277；
- iOS 18.6～18.7 使用 CVE-2025-43529；
- 两种 RCE 路径随后都可以进入 CVE-2026-20700 等阶段。

---

## 四、第一阶段：JavaScriptCore

### 4.1 为什么 JavaScriptCore 是关键入口？

Safari/WebKit 面对的是大量不可信网页内容。因此其 JavaScript 引擎必须处理：

- JavaScript；
- JIT 编译；
- 类型推断；
- 对象管理；
- 垃圾回收；
- 优化与反优化；
- 大量动态数据结构。

复杂性越高，内存安全问题的攻击面也越大。DarkSword 使用了两个 JavaScriptCore 漏洞。

### 4.2 CVE-2025-31277

公开研究将 CVE-2025-31277 描述为 JavaScriptCore 中与 JIT 优化 / 类型混淆有关的内存破坏漏洞。苹果在 iOS 18.6 中修复该问题。

从安全研究角度，它体现了 JIT 引擎的典型风险：

```text
JavaScript 类型状态
   ↓
JIT 优化假设
   ↓
运行时状态变化
   ↓
错误的类型假设
   ↓
内存访问异常
```

这里不应该简单理解为："JIT = 不安全"。真正的问题是：优化器对程序状态做出的安全假设是否始终成立。

---

## 五、第二个 JavaScriptCore 漏洞：CVE-2025-43529

对于更新版本的 iOS，DarkSword 使用了另一个 JavaScriptCore 漏洞：CVE-2025-43529。

GTIG 将其描述为与 JavaScriptCore DFG JIT 层垃圾回收有关的内存破坏漏洞。苹果随后在 iOS 18.7.3、iOS 26.2 中修复。

这说明 DarkSword 并不是简单依赖一个固定 RCE。它实际上具有"版本判断 → 选择对应 RCE → 进入下一阶段"这样的模块化结构。这也是 exploit kit 工程化的重要特征。

---

## 六、fakeobj / addrof 与任意内存访问

GTIG 的公开分析指出，这两个 JavaScriptCore exploit 都建立了自己的 fakeobj、addrof 原语，然后进一步构建任意读写能力。

这里从安全研究角度理解即可。

- **addrof**（概念上）：获取某个 JavaScript 对象对应的内存地址。
- **fakeobj**（概念上）：让 JavaScript 引擎将某段受控制的数据解释为对象引用。

二者结合后，理论上可以逐渐从 JavaScript 对象操作扩展到底层内存访问能力。这类原语是浏览器 exploit 开发中的重要研究对象。

但这里必须强调：获得某种浏览器进程内存读写能力 ≠ 获得整个 iPhone 的控制权。后面还有 PAC、Sandbox、IPC、系统服务和 Kernel 等多个边界。

---

## 七、PAC 绕过：CVE-2026-20700

这是 DarkSword 中非常值得关注的一环。

### 7.1 PAC 是什么？

PAC，即 Pointer Authentication Code，它利用 ARM64e 硬件能力，对特定指针进行认证。抽象来看：

```text
Pointer + Authentication Context + Hardware Secret
   ↓
PAC
```

之后使用指针时进行验证。如果指针被非法修改，认证可能失败。

因此 PAC 可以提高返回地址篡改、函数指针篡改、某些控制流攻击的难度。

### 7.2 DarkSword 的 PAC 阶段

DarkSword 使用 CVE-2026-20700。GTIG 将其描述为 dyld 中的 user-mode PAC bypass。该漏洞与后续 exploit 阶段配合使用，并于 iOS 26.3 得到修复。

这里有一个非常重要的安全概念：**PAC 被绕过 ≠ PAC 机制失效**。更准确地说，是某个具体软件组件的 PAC 使用方式存在漏洞。这与"攻击者完全破解 ARM Pointer Authentication"是完全不同的概念。

---

## 八、为什么 DarkSword 不需要传统意义上的 PPL/SPTM 绕过？

这是 DarkSword 与很多旧式 iOS exploit chain 一个值得注意的区别。

GTIG 指出，DarkSword 的整个攻击链以及最终 payload 都采用 JavaScript，因此不需要像某些传统攻击链一样寻找专门用于突破 PPL 或 SPTM 的漏洞，以便执行未签名的原生二进制代码。

这体现出一个非常有意思的趋势：

```text
传统思路
WebKit RCE → Native code → Sandbox Escape → Kernel → PPL bypass → SPTM bypass → Unsigned executable

DarkSword 的思路
JavaScript → JSC RCE → JavaScript + Native APIs / IPC → Sandbox Escape → Kernel → JavaScript Payload
```

因此，攻击链的"工程路径"发生了变化。这并不是说 PPL/SPTM 不重要，而是 DarkSword 通过 JavaScript 作为主要载体，减少了部分传统原生二进制执行阶段的需求。

---

## 九、Safari Sandbox：第二道安全边界

浏览器 RCE 后，攻击者面对的下一个问题就是：我现在到底能访问什么？

Safari 并不是一个拥有完整系统权限的进程。WebContent 进程受到 sandbox 限制。因此 RCE 并不等于系统权限。这正是现代 iOS exploit chain 必须继续寻找 sandbox escape 的原因。

---

## 十、ANGLE 漏洞：WebContent → GPU

DarkSword 使用 CVE-2025-14174。GTIG 将其描述为 ANGLE 中的内存破坏问题，并指出攻击链利用它从 WebContent 沙箱向 GPU 进程扩展。

这说明攻击者并不是简单地"关闭 Safari 沙箱"。更准确的描述是：利用另一个具有不同权限边界的系统组件作为下一跳（WebContent → GPU Process）。

这种"进程跳板"是现代浏览器攻击链的典型设计。

---

## 十一、GPU → mediaplaybackd

随后 DarkSword 使用 CVE-2025-43510。GTIG 将其描述为 iOS Kernel 中的内存管理漏洞。攻击链继续从 GPU 进程向 mediaplaybackd 等系统组件扩展。

这里可以看到一个明显特点：WebContent → GPU → mediaplaybackd → Kernel，每一个阶段都尽量利用新的权限上下文。

因此攻击链不是简单的"一个漏洞获得全部权限"，而是多个相互独立的安全边界被逐步突破。

---

## 十二、XNU Kernel 阶段

DarkSword 最后涉及 CVE-2025-43520。公开报告将其描述为 iOS Kernel 中与内存破坏相关的问题，并指出其与 VFS 实现中的竞态条件有关。

Kernel 是 iOS 最关键的安全边界之一。一旦攻击链进入 Kernel 阶段，研究重点就从浏览器安全转向内核对象、内存管理、IPC、权限模型和系统完整性。

但是需要特别注意：**Kernel 漏洞 ≠ 自动绕过所有 iOS 安全机制**。现代 iOS 还存在多层硬件与软件防护，例如 PAC、PPL、SPTM、代码签名、沙箱、KTRR/相关内核完整性设计、Secure Enclave 等。

因此研究报告中不应该简单写成"DarkSword 通过一个 Kernel 漏洞完全破解 iPhone"。准确说法应该是：DarkSword 将多个用户态、沙箱与内核漏洞组合起来，实现针对特定系统版本的完整攻击链。

---

## 十三、最终载荷：GHOSTKNIFE

DarkSword 与多个最终 payload 家族相关，其中一个是 GHOSTKNIFE。

GTIG 观察到 GHOSTKNIFE 能够收集多类数据，包括：已登录账户、消息、浏览器数据、位置历史、文件、截图、音频等。其 C2 通信使用 HTTP，并结合 ECDH 与 AES 相关加密机制。

此外，GHOSTKNIFE 还具备模块化设计，可以根据服务器端配置执行不同数据收集任务。

一个值得注意的反取证行为是：删除部分 CrashReporter 日志。这类行为的目的显然是降低异常崩溃留下的取证痕迹。从防御角度，这意味着 Crash 日志本身不能成为唯一证据来源。

---

## 十四、GHOSTSABER

另一类相关 payload 是 GHOSTSABER。

公开分析显示，它能够执行：设备信息收集、账户枚举、应用枚举、文件列表获取、SQLite 数据查询、文件窃取、Photos 数据收集、JavaScript 执行。其 C2 通过 HTTP/HTTPS 与服务器通信。

GTIG 还指出，一些命令在样本中存在接口或引用，但实际实现并不完整，因此不能简单断言所有声明功能都能够正常执行。

这是分析恶意软件时非常重要的方法：代码中出现一个函数名，不等于该能力在实际攻击中已经实现。

---

## 十五、GHOSTBLADE

第三个相关家族：GHOSTBLADE。GTIG 将其描述为一个 JavaScript dataminer。公开样本能够收集大量数据，包括：

- **通信**：iMessage、Telegram、WhatsApp、邮件索引、通话记录、联系人相关数据。
- **身份与凭据**：设备标识、登录账户、Keychain 相关数据、SIM 信息、设备配置。
- **位置**：位置历史、Wi-Fi 信息、Find My 设置、Location Services 设置。
- **个人数据**：Photos、Screenshots、iCloud Drive、Notes、Calendar。
- **金融**：Cryptocurrency wallet data。
- **浏览器**：Safari history、bookmarks、cookies。

GTIG 同时指出，GHOSTBLADE 会删除部分 crash reports。

---

## 十六、DarkSword 的真正价值：不是"六个漏洞"

如果只把 DarkSword 总结为"六个 iOS 漏洞组成攻击链"，其实低估了它。真正值得研究的是下面这个结构：

```text
                    DARKSWORD
                        │
          ┌─────────────┴─────────────┐
          │                           │
     Exploit Layer               Payload Layer
          │                           │
          ▼                           ▼
     JavaScriptCore              GHOSTKNIFE
          │                      GHOSTSABER
          ▼                      GHOSTBLADE
         PAC
          │
          ▼
     Sandbox Escape
          │
          ▼
          XNU
          │
          ▼
     Privileged JS
```

也就是说：**Exploit Chain 与 Malware Payload 可以分离**。

这是现代商业监控软件生态非常重要的架构特征。攻击者不一定需要重新开发完整 exploit chain，只需要获得"漏洞利用能力 + 自己的 payload"，即可形成新的攻击活动。

---

## 十七、DarkSword 与 Coruna 的关系

DarkSword 与 Coruna 经常被放在一起讨论。这是因为二者都体现了高级 iOS exploit 能力向多个威胁行为者扩散。但技术上存在明显差异。

| 项目 | Coruna | DarkSword |
| --- | --- | --- |
| 公开披露 | 2026-03-03 | 2026-03-18 |
| 主要系统范围 | iOS 13.0–17.2.1 | iOS 18.4–18.7 |
| 漏洞规模 | 23 exploits | 6 vulnerabilities |
| 完整攻击链 | 5 条 | 多阶段 full-chain |
| 主要载体 | JavaScript + native components | JavaScript |
| PPL/SPTM | 部分链路涉及相关绕过 | 公开报告指出无需专门寻找相应绕过漏洞 |
| 最终目的 | 包括金融数据/钱包窃取 | 信息窃取、凭据和金融数据等 |
| 扩散特点 | 商业监控 → 水坑攻击等 | 多个商业监控客户及疑似国家背景活动 |

Coruna 的公开研究显示其包含五条完整链和 23 个 exploit；DarkSword 则是针对较新 iOS 版本的六漏洞链。

---

## 十八、DarkSword 对 iOS 安全研究的启示

### 1. WebKit 仍然是重要攻击面

浏览器处理大量不可信内容。因此 JavaScriptCore + WebKit + JIT 依然值得重点研究。

### 2. PAC 改变了漏洞利用工程

过去的内存破坏漏洞可能直接影响控制流。ARM64e 时代则需要考虑：Pointer → PAC → 认证上下文 → 控制流完整性。因此现代 exploit 开发与传统 ARM64 内存破坏已经存在明显差异。

### 3. Sandbox 是真正的安全边界

RCE 只是第一步。真正的攻击链通常还需要解决：RCE → Sandbox → IPC → Privilege → Kernel。这也是为什么单个浏览器 CVE 的严重程度不能简单等同于完整设备失陷。

### 4. Kernel 研究正在进入硬件辅助安全时代

现代 iOS Kernel 已经不是简单的"找到任意读写 → 获得 root"。研究者还必须考虑：PAC、PPL、SPTM、内存完整性、类型感知分配、EMTE/MIE、页表保护、Secure Enclave。

因此未来的 Kernel exploit 研究会越来越接近：软件漏洞研究 + ARM 硬件安全 + 操作系统架构研究。

---

## 十九、防御建议

### 普通用户

最有效的策略非常简单：及时更新 iOS。GTIG 明确建议用户安装最新 iOS；如果无法更新，则考虑启用 Lockdown Mode（锁定模式）。

尤其应避免：

- 点击来源不明的链接；
- 在陌生网站输入钱包助记词；
- 安装不可信配置描述文件；
- 安装来源不明的企业应用；
- 在已经出现异常行为的设备上继续处理重要账户。

### 企业

企业环境应重点建设 MDM + EDR/Mobile Threat Defense + Threat Intelligence，并持续监控：iOS 版本、设备型号、安全补丁状态、异常 Safari/WebKit 活动、恶意域名、可疑水坑网站、异常账户登录、高价值数据访问。

---

## 二十、结论

DarkSword 是研究现代 iOS 安全非常有价值的案例。它最重要的意义并不是"拥有六个漏洞"，而是展示了一个完整的现代攻击链如何跨越多个安全边界：

JavaScriptCore → PAC / dyld → WebContent Sandbox → GPU → 系统服务 → XNU Kernel → 最终 Payload

同时，DarkSword 还展示了一个更加值得警惕的趋势：高级漏洞利用能力正在从少数专业攻击团队向更多商业和犯罪活动扩散。GTIG 观察到多个不同攻击者采用 DarkSword，并发现其最终 payload 可以发生变化。

因此，对 iOS 安全研究而言，DarkSword 最值得研究的不是"如何复现攻击"，而是：

- 漏洞为什么能够跨越安全边界？
- PAC、Sandbox 和 Kernel 防护分别在哪个阶段发挥作用？
- 补丁到底改变了什么？
- MIE、SPTM/TXM 等新一代硬件辅助防护能否进一步压缩这种攻击链的空间？

这几个问题，才是 DarkSword 对现代 iOS 安全研究最重要的长期价值。

---

**咨询iOS系统安全相关问题，请联系 Telegram：https://t.me/one00190**
