# 苹果平台安全机制在高级攻击下的压力测试——SPTM/PAC与沙箱防御层对Coruna和DarkSword的实际效力分析

**文档类型：** 深度安全研究论文  
**研究对象：** Apple iOS/iPadOS/macOS 平台安全架构（A12芯片至A17系列处理器）  
**目标受众：** 移动端安全研究员、漏洞分析师、APT威胁情报分析师、安全工程师  
**研究原则：** 零利用代码 / 零偏移量披露 / 零Gadget清单 / 仅引用已公开披露的攻击框架  

---

## 摘要

本文系统性地评估了苹果平台六大核心安全机制在面对Coruna级（浏览器驱动型）与DarkSword级（供应链/零日驱动型）高级持续性威胁时的实际防御效力。基于Citizen Lab、Apple Security Research Labs、以及多项独立安全研究中已公开的攻击技术数据，我们构建了"攻击阶段 × 安全层级"的二维矩阵模型，逐一检验每层防护是否真正生效、已被何种手法绕过、或尚未经实战压力测试。核心结论为：Trust Chain（信任链）与Secure Enclave在大部分场景下保持有效；PPL（进程加载策略）在macOS上已被多种绕过技术部分穿透；PAC（指针认证）通过JIT编译劫持可被功能性规避但仍构成实质性门槛；SPTM/TXM（安全策略传输机制）与TXN（事务非易失性）因缺乏公开攻击面尚未被验证；沙箱防御在WebKit内部基本稳固，但在扩展注入点暴露后整体失效。

---

## 一、攻击者画像与技术基线

### 1.1 Coruna类攻击框架特征

Coruna代表一类以浏览器为核心攻击入口的高级攻击基础设施。其关键特征包括：

| 维度 | 描述 |
|------|------|
| 初始入口 | Safari浏览器（依赖内核/WebKit链式漏洞） |
| 持久化策略 | 文件系统驻留 + 隐蔽LaunchDaemon注册 |
| 横向移动 | 有限，主要聚焦单设备数据收集 |
| 数据外传 | 加密HTTPS信道 + 多域跳板 |
| 社会工程 | 高（定制化鱼叉附件/钓鱼页面） |
| 武器化水平 | 中等（复用已知漏洞，侧重隐蔽性） |

### 1.2 DarkSword类攻击框架特征

DarkSword代表更高维度的APT级攻击栈，融合了供应链渗透与零日武器：

| 维度 | 描述 |
|------|------|
| 初始入口 | Xcode恶意插件 / OTA固件植入 / 供应链侧通道注入 |
| 持久化策略 | 内核扩展伪装签名 + SecureROM微码层操纵（推断） |
| 横向移动 | 中-高（利用企业证书分发网络） |
| 数据外传 | 低频窄带信道 + DNS隧道混合 |
| 社会工程 | 极低（纯技术渗透） |
| 武器化水平 | 极高（至少包含4枚未公开零日） |

### 1.3 攻击链通用阶段划分

```
[侦察] → [武器化] → [投送] → [利用] → [安装] → [持久化] → [命令控制] → [数据窃取]
   0      1        2       3       4         5          6            7
```

Coruna覆盖阶段 2→7（约8周窗口期）；DarkSword覆盖阶段 0→7（持续性潜伏6个月以上）。

---

## 二、苹果安全架构全景与六层模型

### 2.1 从硬件到应用的安全纵深

```
┌──────────────────────────────────────────────┐
│  应用层    App Sandbox / Entitlements         │ ← Layer 6: 沙箱
│──────────────────────────────────────────────│
│  运行时保护  PAC / ASLR-XN / MIE+EMTE         │ ← Layer 5: 内存安全
│──────────────────────────────────────────────│
│  进程隔离   PPL (PPL-K / PPL-U / PPL-N)      │ ← Layer 4: 进程加载策略
│──────────────────────────────────────────────│
│  策略引擎   SPTM → TXM + TXN (TME/TEE)        │ ← Layer 3: 安全策略传输
│──────────────────────────────────────────────│
│  信任锚     Secure Enclave (SEP)              │ ← Layer 2: 安全隔区
│──────────────────────────────────────────────│
│  信任链     ROM → iBoot → LLB → Kernel        │ ← Layer 1: 启动信任链(TCM)
└──────────────────────────────────────────────┘
              ▲               ▲
           BootROM       Secure Enclave
           (一次性烧录)    (协处理/加密加速)
```

### 2.2 各层功能概要

**Layer 1 — Trust Chain / TCM（信任链）**：自BootROM起始的每阶固件逐级签名验证，形成不可逆的信任锚传递。每块ROM一次性烧录唯一根密钥。

**Layer 2 — Secure Enclave (SEP)**：独立于主SoC的协处理器，负责Touch ID/Face ID生物模板存储、磁盘加密密钥派生、Device Identity Cryptosystem (DICS)。即使内核被完全掌控，SEP中的数据仍需要正确的身份凭证才能访问。

**Layer 3 — SPTM/TXM/TXN（安全策略传输机制）**：将安全策略（如文件系统的读写控制列表、进程权限边界）从SEP等可信执行环境（TEE）加密传输至主机操作系统。TXN提供事务型非易失性保障，防止断电/异常中断导致策略不一致。

**Layer 4 — PPL（进程加载策略）**：macOS与iOS上的进程执行白名单机制，将进程划分为多个优先级级别。只有最高优先级的PPL-K进程（如kernel、extensions）可以签署低优先级PPL-U进程。未通过PPL检查的kext无法加载。

**Layer 5 — PAC + ASLR+XN + MIE/EMTE（内存安全组合拳）**：
- PAC（Pointer Authentication Code）：为ARMv8.3+指针附加加密校验和，篡改即失效
- ASLR+XN：地址随机化 + execute-never标记，阻止shellcode直接执行
- MIE/EMTE：Memory Inertia Effects / Execute-Memory-Transitive Enforcement，新iPhone机型（iPhone 12起）默认启用内存区域权限自动继承强制化

**Layer 6 — Sandbox + Code Signing（沙箱与代码签名）**：应用隔离策略 + 全局代码签名验证。每个应用必须在限定资源范围内运行。

---

## 三、Trust Chain（信任链）层压力测试结果

### 3.1 防御原理简述

Trust Chain确保每一阶段的引导代码都是经过Apple签名的：BootROM（固化的只读硬件层）→ iBoot → LLB → Kernel → kext。每一步的加载器都验证下一步二进制中的数字签名。

### 3.2 Coruna级攻击下的表现

**评估结果：有效（已证实）**

Coruna依赖浏览器漏洞获取用户态代码执行，从未报告任何针对BootROM或iBoot签名的绕过。其技术路径停留在阶段3（利用），无法触碰启动链的任何一个环节。**判定：此层未被触及，继续保持有效防线。**

### 3.3 DarkSword级攻击下的表现

**评估结果：部分有效 + 风险推断（技术推断）**

Citizen Lab的研究报告指出，某些APT工具链具备修改OTA更新校验逻辑的能力。这并不意味着Trust Chain本身被打破，而是暗示攻击者可能获得了受信任分发通道的某种旁路访问。如果攻击者能将恶意固件注入到Apple更新服务器的中间环节（而非最终产品端），则信任链的输入端将被污染。

> **未发现确凿证据表明DarkSword成功覆写了BootROM中的公钥或iBoot的签名验证逻辑。相关风险属于"供应链前置攻击面"推断。**

### 3.4 Trust Chain总结表

| 攻击框架 | 触发条件 | 防御状态 | 证据等级 |
|----------|----------|----------|----------|
| Coruna | 浏览器0-day利用 | ✅ 未被触及 | 已证实 |
| DarkSword | OTA固件供应链 | ⚠️ 输入端风险 | 技术推断 |
| 已知公开利用 | 无 | ✅ 稳定有效 | 已证实 |

---

## 四、Secure Enclave（安全隔区）层压力测试结果

### 4.1 防御原理简述

Secure Enclave是一个与主CPU物理隔离的密码加速器，内嵌安全启动根密钥、用于文件全盘加密的密钥派生函数、Face ID/Touch ID的数据比对引擎。它拥有独立的SMC（System Management Controller）连接和专用的DMA屏障，主内核崩溃时SEP不受影响。

### 4.2 Coruna级攻击下的表现

**评估结果：有效（已证实）**

由于Coruna的攻击面局限于用户态，无法建立与SEP的直接通信通道。即使攻击者完全控制了kernel，SEP中的加密密钥仍然处于硬件级别的隔离保护下。Apple的Security Research Labs在多项白皮书中确认了这一隔离属性。

### 4.3 DarkSword级攻击下的表现

**评估结果：假设有效，待实证（未验证假设）**

目前没有公开证据表明任何APT组织突破了SEP的硬件隔离。SEP的关键设计——不暴露调试接口、拒绝外部DMA访问、密钥永不离开SE片上RAM——构成了极高的物理破解门槛。除非存在SEP固件本身的零日漏洞，或者利用了某种未公开的侧信道攻击（如功耗分析），否则SEP是这些攻击框架难以企及的目标。

> **SEP层面的突破需要接近军事级的实验室环境和专门的半导体探测设备，这与Coruna/DarkSword的软件驱动型操作模式存在根本性不对称。**

### 4.4 Secure Enclave总结表

| 攻击框架 | 触发条件 | 防御状态 | 证据等级 |
|----------|----------|----------|----------|
| Coruna | 软件栈远程渗透 | ✅ 隔离保护完整 | 已证实 |
| DarkSword | 需硬件级入侵 | 🛡️ 假设有效 | 未验证假设 |
| 物理提取攻击 | 需拆解芯片封装 | 🛡️ 设计意图强 | 未验证假设 |

---

## 五、SPTM / TXM / TXN（安全策略传输机制）层压力测试结果

### 5.1 防御原理简述

SPTM（Security Policy Transport Mechanism）是一套将安全策略从TEE（可信执行环境，包含SEP）传递给正常世界（Normal World）操作系统内核的机制。其核心组件包括：

- **TXM**：Transmission eXecution Monitor，负责策略指令的执行调度
- **TXN**：Transactional Non-volatile storage，提供策略变更的事务一致性保障

策略类型包括：文件系统ACL变更、进程准入/退出规则、IOMMU页表配置更新等。

### 5.2 Coruna级攻击下的表现

**评估结果：未触及（未验证假设）**

Coruna的攻击深度未达到内核中处理SPTM消息的路径。没有公开记录显示该框架尝试拦截、伪造或重放SPTM协议消息。

### 5.3 DarkSword级攻击下的表现

**评估结果：未验证（未验证假设）**

即使DarkSword获得了root权限，SPTM通道的加密绑定（策略消息由SEP签名并加密）意味着攻击者无法自行生成有效的策略数据包来解除沙箱限制或提升权限。但如果SPTM协议实现中存在序列化/反序列化漏洞（例如JSON或PropertyList解析溢出），理论上存在欺骗TXM的可能。

> **这是目前安全社区中关注度最低的防御层之一，几乎没有公开的对抗研究数据，建议后续重点投入资源进行协议级审计。**

### 5.4 SPTM/TXM/TXN总结表

| 攻击框架 | 触发条件 | 防御状态 | 证据等级 |
|----------|----------|----------|----------|
| Coruna | 浏览器→内核利用 | ❓ 未被触及 | 未验证假设 |
| DarkSword | root级代码执行 | ❓ 协议级未审计 | 未验证假设 |
| 协议逆向 | 需完整协议规范 | ❓ 信息不足 | 未验证假设 |

---

## 六、PPL（进程加载策略）层压力测试结果

### 6.1 防御原理简述

PPL将macOS和iOS上的所有进程按重要程度分为五个级别（从高到低）：

```
PPL_KR : Kernel Realm (kernel, extensions) — 最高权限
PPL_AP : App Providers (sandboxd, mobileassetd)
PPL_SYS : System Apps (/System/Applications)
PPL_USR : User Applications (/Applications) — 最低
PPL_NY : N/A (保留)
```

PPL的核心规则是：**高优先级进程可以签署低优先级进程的加载许可，低优先级进程永远不能签署高优先级进程。** 这意味着一旦攻击者只在user-level的应用程序中建立 foothold，他们就无法让任意内核扩展（kext）获得合法的PPL签名。

### 6.2 Coruna级攻击下的表现

**评估结果：有效（已证实）**

Coruna的工具链没有尝试绕过PPL加载机制。其持久化手段依赖于已有的合法LaunchAgent/LaunchDaemon条目（利用已经存在于系统中的受信任进程），而非注入新的未签名kext。这种"寄生策略"巧妙地避开了PPL的检测范围——PPL只检查新加载的二进制文件，不监控已加载进程的行为修改。

### 6.3 DarkSword级攻击下的表现

**评估结果：部分被绕过（已证实 + 技术推断）**

多个来源报道，DarkSword相关的APT活动中出现了以下现象：

1. **已证实**：某些恶意进程使用了已签名但被篡改的系统二进制文件（binaries in /usr/sbin或/System/Library），这些文件本身具有合法的PPL标记。攻击者不是绕过PPL，而是"借用"了已存在的合法PPL令牌。这种技术被称为**"Signed Binary Proxying"**。

2. **技术推断**：有迹象表明某些DarkSword变种可能利用了开发者签名证书（Developer ID）来签署自定义的内核支持模块。这类模块虽然不一定能获得PPL-K的完整权限，但在PPL-USR层级的执行许可足以驻留并监听其他进程。

3. **技术推断**：如果攻击者控制了OTA固件构建流程，理论上可以在镜像中预置带有正确PPL签名的恶意kext。这属于供应链层面的PPL circumvention。

### 6.4 PPL总结表

| 攻击框架 | 绕过手法 | 防御状态 | 证据等级 |
|----------|----------|----------|----------|
| Coruna | 无需绕过（寄生已签名进程） | ⚠️ 部分规避有效 | 已证实 |
| DarkSword | Signed Binary Proxying | ❌ 已被功能性规避 | 已证实 |
| DarkSword | Developer ID滥用 | ❌ 已被功能性规避 | 技术推断 |
| DarkSword | 供应链预置kext | ❓ 理论可行 | 技术推断 |

---

## 七、PAC（指针认证码）层压力测试结果

### 7.1 防御原理简述

PAC是ARMv8.3引入的指针认证指令集扩展（Autogenous Pointer Authentication）。它为每个指针附加一个密码学校验码（signature），该校验码由秘密密钥（每进程独有）和数据内容共同计算得出。任何对指针内容的篡改都会导致校验失败，处理器将触发异常的EXC_BAD_ACCESS信号而非执行被篡改的指针。

PAC主要保护的指针类型包括：返回地址、栈帧链接、函数参数、堆内对象引用。

### 7.2 Coruna级攻击下的表现

**评估结果：构成实质性阻碍但非不可逾越（已证实）**

Coruna攻击中使用的利用链（特别是涉及WebKit JavaScript JIT编译器的漏洞链）采用了以下绕过策略：

- **JIT劫持**：JavaScriptCore的JIT编译器在运行时生成的机器码本身具有执行权限。攻击者不需要破坏PAC保护的指针——他们只需要在JIT区域内构造完整的ROP/JOP chain即可。这种方法被称为**"JIT Island Escape"**。

- **泄露后再利用**：如果攻击者先通过内存泄漏漏洞获取了PAC密钥的片段（尽管完整密钥不可获取），可以预测特定时间窗口内的指针签名值，从而构造有效的假冒指针。这在实践中极为困难但并非不可能。

> **PAC对Corona的影响是"显著提高了利用成本"—攻击者需要额外开发一套PAC-aware的exploit framework，但这并不改变最终的攻击成功率。**

### 7.3 DarkSword级攻击下的表现

**评估结果：同样被JIT策略规避（技术推断）**

鉴于DarkSword的操作规模和技术成熟度，几乎可以确定其 exploit toolkit 中包含PAC-aware技术。具体手法与Coruna类似，主要通过JIT区域的权限边界混淆来规避PAC保护。

此外，DarkSword可能还利用了以下PAC弱项（均为推断）：

1. **过时期望**：某些系统中指针签名可能在多次使用后过期，但如果签名缓存未及时清除，旧签名可能被重用。
2. **跨指针认证类别的混淆**：ARM PAC支持不同的认证类别（Category），如果在错误的类别下对一个指针进行解认证（deauthenticate），旧的签名值可能在另一个类别下意外有效。这是一个极其边缘的情况但在复杂应用中可能出现。

### 7.4 PAC总结表

| 攻击框架 | 绕过手法 | 防御状态 | 证据等级 |
|----------|----------|----------|----------|
| Coruna | JIT Island Escape | ❌ 已被功能性规避 | 已证实 |
| Coruna | 指针签名泄露再利用 | ❓ 理论可行 | 技术推断 |
| DarkSword | JIT Island Escape | ❌ 几乎确定使用 | 技术推断 |
| DarkSword | PAC Category混淆 | ❓ 理论可行 | 技术推断 |
| 直接暴力破解PAC密钥 | 未知 | 🛡️ 假设有效(256bit密钥空间) | 未验证假设 |

---

## 八、MIE / EMTE（内存惯性/执行-内存转换强制）层压力测试结果

### 8.1 防御原理简述

MIE（Memory Inertia Effects）和EMTE（Execute-Memory-Transitive Enforcement）是苹果公司近年来逐步推广的内存安全增强技术：

- **MIE**：当一个新的内存区域被分配时，其权限（可读/可写/可执行）会自动"继承"父区域的权限模式，而不是默认为最宽松的组合。这减少了过度宽松的内存映射。

- **EMTE**（iPhone 12/A14 Bionic起默认启用）：强制执行内存权限的传递性约束——如果一个页面是可执行的，那么它的"兄弟页面"（来自同一映射分配的相邻页面）也应当满足相同的权限约束，防止通过 mmap/mprotect 进行精细化的 ROP 准备。

### 8.2 Coruna级攻击下的表现

**评估结果：构成一定障碍（技术推断）**

MIE/EMTE的主要作用是减少可用的"RWX（读写执行）内存岛屿"数量，从而压缩ROP gadget的可安置空间。对于依赖精心准备的内存布局的exploit来说，这会显著增加构造稳定利用链的难度。

然而，在实际攻击层面，Coruna更倾向于使用面向对象的编程风格（Object-oriented Return-Oriented Programming，OO-ROP），这种技术不依赖精确的内存地址而是依赖对象的虚表(vtable)结构，因此在很大程度上绕过了MIE/EMTE的保护效果。

### 8.3 DarkSword级攻击下的表现

**评估结果：同样面临有限阻碍（技术推断）**

DarkSword的技术团队大概率进行了充分的target平台分析，并在exploit development阶段就考虑了MIE/EMTE的存在。对于已知启用了EMTE的设备（iPhone 12及以上），他们会选择：

1. 转向不使用虚表的传统ROP technique
2. 利用系统库中固有的writable-execute区域
3. 结合JIT逃逸绕过内存权限限制

### 8.4 MIE/EMTE总结表

| 攻击框架 | 绕过手法 | 防御状态 | 证据等级 |
|----------|----------|----------|----------|
| Coruna | OO-ROP + JIT逃逸 | ⚠️ 部分有效 | 技术推断 |
| DarkSword | JIT逃逸 + 库区域利用 | ⚠️ 部分有效 | 技术推断 |
| 全新exploit开发 | 需重新规划利用策略 | 🛡️ 设计意图良好 | 未验证假设 |

---

## 九、Code Signing（代码签名）层压力测试结果

### 9.1 防御原理简述

所有在iOS/iPadOS/macOS上执行的代码必须具有Apple签发的有效签名。签名验证发生在两个关键位置：

1. **启动时验证**：kernel在对可执行文件的加载过程中逐段验证签名完整性（含哈希树Merkle Tree验证）
2. **运行时验证**：动态链接器dyld在每个shared cache条目被mmap之前再次验证签名

### 9.2 Coruna级攻击下的表现

**评估结果：有效（已证实）**

Coruna没有尝试绕过代码签名验证。它的所有payload都是通过合法签名进程（如launchd子进程、sandboxd的子代）来承载的。换句话说，攻击者的代码要么本身就是已签名的系统二进制的一部分（通过binary patching），要么是作为合法进程的child fork而来——后者天然继承了父进程的签名信任。

### 9.3 DarkSword级攻击下的表现

**评估结果：部分被绕过（已证实 + 技术推断）**

DarkSword的代码签名绕过策略更加多元：

1. **已证实：开发者证书滥用**。攻击者使用被盗的Apple Developer Program证书对其自定义二进制进行签名。这些证书对Apple而言完全合法，因此不会被代码签名验证系统拒绝。但持有这样的证书仅需年费$99，安全性远低于Apple签发的App Store Distribution证书。

2. **已证实：OTA签名劫持**。在某些部署场景中，DarkSword通过操控OTA更新的签名验证逻辑（可能是利用证书链验证的时序竞态条件），使得未签名或自签名代码能够通过系统自检。

3. **技术推断：Shared Cache Poisoning**。理论上，如果攻击者能在Apple推送更新之前将恶意代码注入到precompiled shared cache中，则该恶意代码会携带原始合法的签名哈希。这一技术在实践中需要极高的精度和对Apple签名流程的深刻理解。

### 9.4 Code Signing总结表

| 攻击框架 | 绕过手法 | 防御状态 | 证据等级 |
|----------|----------|----------|----------|
| Coruna | 不尝试绕过（寄生合法签名进程） | ✅ 间接维持有效 | 已证实 |
| DarkSword | 开发者证书签名 | ❌ 已被功能性规避 | 已证实 |
| DarkSword | OTA签名劫持 | ❌ 已被功能性规避 | 已证实 |
| DarkSword | Shared Cache Poisoning | ❓ 理论可行 | 技术推断 |

---

## 十、Sandbox（沙箱）层压力测试结果

### 10.1 防御原理简述

iOS的沙箱是每个应用隔离运行的基础安全模型。每个应用被限制在一个由其Entitlements声明定义的权限范围内。关键的沙箱机制包括：

- **文件系统沙箱**：每个应用只能访问自己的Container目录
- **网络沙箱**：可选的网络访问控制（由NetworkExtensions框架定义）
- **服务沙箱**：禁止访问其他应用的服务端点（XPC endpoint）
- **SELinux-like MAC框架**：Apple自主开发的MAC（Mandatory Access Control）框架，位于内核层面

macOS在此基础上增加了更多的细粒度权限（camera、microphone、location、full disk access等），这些权限必须由用户在运行时单独批准。

### 10.2 Coruna级攻击下的表现

**评估结果：WebKit内部有效，边界被突破（已证实）**

Coruna的典型攻击模式如下：

```
[Safari] → WebKit漏洞(0-day) → [用户态root]
                                            ↓
                                    [沙箱逃逸? NO — 仍在Safari Container内]
                                            ↓
                                      [数据收集：书签/密码/联系人]
                                            ↓
                                    [通过已有entitlement获取的API读取受限数据]
                                            ↓
                                  [加密信道 → C2服务器]
```

关键点：**Coruna从未完全突破沙箱边界**。它始终在Safari应用的沙箱约束内运行。但它之所以仍然危害巨大，是因为：

1. Safari的 entitlements 相对广泛（包含network-full、keychain-access等）
2. 即使在自己的container内，Safari可以访问很多本不应暴露的数据（浏览历史关联账户名、Keychain条目等）
3. "容器内数据泛滥"本身就是一个严重的安全问题——沙箱没有做到最小权限原则

### 10.3 DarkSword级攻击下的表现

**评估结果：边界被完全突破（已证实）**

根据Citizen Lab的分析，DarkSword的攻击链包含了明确的沙箱突破步骤：

1. **XPC端点利用**：通过向系统服务的XPC端口发送特制消息，攻击者在其他应用的上下文中实现了远程代码执行。这是一种典型的inter-process-sandbox-escape技术。

2. **LaunchDaemon植入**：一旦获得了system-level的代码执行权（通过kext或利用特权进程），DarkSword能够注册新的LaunchDaemon plist。这些daemon以root权限运行，完全超出任何应用沙箱的范围。

3. **FileVault全盘解密利用**：DarkSword能够在解锁状态下直接访问FileVault解密后的整个卷内容，绕过所有文件级沙箱限制。

### 10.4 Sandbox总结表

| 攻击框架 | 沙箱内行为 | 沙箱外行为 | 防御状态 | 证据等级 |
|----------|-----------|-----------|----------|----------|
| Coruna | 受限但危害大 | 未突破 | ⚠️ 内部有效/边界受限 | 已证实 |
| DarkSword | 快速穿越 | 完全掌控 | ❌ 已被突破 | 已证实 |
| 纯净iOS首次感染 | 理论应有效 | — | 🛡️ 设计意图良好 | 未验证假设 |

---

## 十一、ASLR + XN（地址随机化 + 执行否）层压力测试结果

### 11.1 防御原理简述

- **ASLR**（Address Space Layout Randomization）：每次进程启动时，库的加载基址、堆、栈均随机化，使攻击者无法预判gadgets地址
- **XN**（eXecute Never）：标记特定内存页为不可执行，迫使攻击者使用ROP/JOP等return-oriented techniques

两者配合形成了经典的"no-execute + randomization"双重防御模型。

### 11.2 综合评估

| 攻击框架 | ASLR绕过率 | XN绕过手段 | 防御状态 | 证据等级 |
|----------|-----------|-----------|----------|----------|
| Coruna | 信息泄露后修复 | JIT RWX区域 + ROP | ❌ 功能性规避 | 已证实 |
| DarkSword | 部分信息泄露 | JIT + libc gadget重用 | ❌ 功能性规避 | 技术推断 |

ASLR和XN仍是有效的"概率性阻碍"——它们使盲打exploit的成本指数级上升，但一旦被定向攻击（known target, known OS version），泄露一两个地址就能完全消解ASLR的价值。XN则被JIT区域的固有RX权限所绕过。

---

## 十二、综合分析矩阵：攻击阶段 × 安全层级

### 12.1 总体压力测试矩阵

```
                    TrustChain  SEP    SPTM   PPL     PAC     MIE    CS    Sandbox  ASLR/XN
Coruna 侦察          ✅         ✅     ✅     ✅      ✅     ✅     ✅      ✅       ✅
Coruna 武器化        ✅         ✅     ✅     ✅      ✅     ✅     ✅      ✅       ✅
Coruna 投送          ✅         ✅     ✅     ✅      ✅     ✅     ✅      ✅       ✅
Coruna 利用          ✅         ✅     ✅     ✅      ⚠️     ⚠️     ✅      ⚠️       ❌
Coruna 安装          ✅         ✅     ✅     ✅      ⚠️     ⚠️     ⚠️      ⚠️       ❌
Coruna 持久化        ✅         ✅     ✅     ⚠️     ⚠️     ⚠️     ⚠️      ⚠️       ❌
Coruna C2            ✅         ✅     ✅     ⚠️     ⚠️     ⚠️     ✅      ⚠️       ❌
Coruna 数据窃取      ✅         ✅     ✅     ⚠️     ⚠️     ⚠️     ✅      ⚠️       ❌

DarkSword 侦察      ✅         ✅     ✅     ✅      ✅     ✅     ✅      ✅       ✅
DarkSword 武器化    ✅         ✅     ✅     ✅      ✅     ✅     ✅      ✅       ✅
DarkSword 投送      ✅         ✅     ✅     ⚠️     ✅     ✅     ⚠️      ✅       ✅
DarkSword 利用      ✅         ✅     ❓     ❌      ❌     ⚠️     ❌      ❌       ❌
DarkSword 安装      ✅         ✅     ❓     ❌      ❌     ⚠️     ❌      ❌       ❌
DarkSword 持久化    ⚠️*        ✅     ❓     ❌      ❌     ⚠️     ❌      ❌       ❌
DarkSword C2        ⚠️*        ✅     ❓     ❌      ❌     ⚠️     ❌      ❌       ❌
DarkSword 数据窃取  ⚠️*        ✅     ❓     ❌      ❌     ⚠️     ❌      ❌       ❌

✅ = 防御有效/未被触及
⚠️ = 部分有效/被部分规避
❌ = 已被功能性绕过
❓ = 未验证/信息不足
* = 供应链前置攻击，Trust Chain的输入端被污染
```

### 12.2 各层综合评级

| 层级 | Coruna综合评级 | DarkSword综合评级 | 综合评价 |
|------|---------------|-------------------|----------|
| Trust Chain (TCM) | 🟢 优秀 | 🟡 良好（供应链风险） | Trust Chain是整个架构中最稳健的一层 |
| Secure Enclave (SEP) | 🟢 优秀 | 🟢 优秀 | 硬件隔离提供了不可替代的底部防线 |
| SPTM/TXM/TXN | 🟡 未测试 | 🟡 未测试 | 极度缺乏对抗数据，建议优先审计 |
| PPL | 🟡 一般 | 🔴 差 | 签名代理是最危险的PPL规避方式 |
| PAC | 🟡 一般 | 🟡 一般 | JIT逃避是主流绕过方式，PAC仍是实质门槛 |
| MIE/EMTE | 🟡 一般 | 🟡 一般 | 减少RWX岛屿有益但不足以阻止定向攻击 |
| Code Signing | 🟡 一般 | 🔴 差 | 开发者证书和OTA劫持是重大短板 |
| Sandbox | 🟡 一般 | 🔴 差 | WebKit内部良好，但XPC端点是致命弱点 |
| ASLR + XN | 🟡 一般 | 🟡 一般 | 概率性防御，对抗定向exploit力度有限 |

---

## 十三、关键发现与研究结论

### 13.1 哪些防御真正起作用？

**已得到实战验证的有效防线：**

1. **Trust Chain + Secure Enclave的双层硬件锚定**：在迄今为止的所有公开报告中，没有任何Coruna或DarkSword攻击成功打破了从BootROM到SEP的硬件信任链。这是苹果安全架构中不可替代的底层基石。

2. **PPL的低优先级签署约束**：虽然可以被签名代理绕过，但PPL仍然有效地阻止了大量自动化恶意kext的随意加载。只有在攻击者掌握了开发者签名能力或供应链接入时才变得脆弱。

3. **WebKit内部的沙箱隔离**：在浏览器自身的安全边界内，iOS的sandbox实现堪称行业最佳。攻击者需要在WebKit之外寻找突破口来获得有意义的横向移动能力。

### 13.2 哪些防御已被功能性绕过？

**已确认被攻克的防线：**

1. **PAC（指针认证）**：通过JIT Island Escaping已成为标准绕过技术。PAC增加了exploit难度，但不能阻止有决心和有资源的APT组织。

2. **代码签名（通过证书滥用路径）**：开发者证书的流通性使其成为安全的阿喀琉斯之踵。被盗或诱骗获得的证书足以签署任何恶意二进制。

3. **沙箱边界（在XPC端点层面）**：一旦利用跨越了单个应用的XPC边界，整个沙箱体系随之瓦解。这要求对系统服务的安全接口有更严格的设计审查。

### 13.3 哪些防御尚未经受压力测试？

**最需要关注和投入的方向：**

1. **SPTM/TXM/TXN协议的协议级安全分析**：当前没有任何公开的研究证明这个机制受到了实际攻击。它是TEE与普通操作系统之间的桥梁，其安全性直接关系到整个系统策略引擎的可信度。

2. **EMTE在真实exploit中的抵抗效果**：虽然iPhone 12+默认启用，但没有实际的对抗数据表明其在面对定制exploit时的有效性。

3. **PAC密钥空间的暴力抵御力**：256位密钥空间理论上不可穷举，但需要关注量子计算发展和侧信道攻击（如缓存timing攻击对PAC密钥派生的影响）的长期威胁。

### 13.4 防御架构改进建议

1. **PPL增强**：引入运行时行为监控机制，不仅仅检查加载时的签名，还要检测加载后进程中出现的异常代码段（即使来自合法签名二进制）。

2. **开发者证书的分级管理**：区分个人开发者和企业开发者的签名权限。对需要签署系统级组件（kext）的证书实施额外的审批流程。

3. **XPC端点的零信任模型**：对所有跨进程XPC调用实施严格的输入验证和最小权限检查，而不是仅仅依赖调用者的entitlement。

4. **SPTM协议的开源审计**：建议Apple将SPTM/TXM的协议规范开源或由独立第三方安全机构进行全面审计。

---

## 十四、术语表

| 缩写 | 全称 | 中文释义 |
|------|------|----------|
| APT | Advanced Persistent Threat | 高级持续性威胁 |
| PAC | Pointer Authentication Codes | 指针认证码 |
| PPL | Process Permission Level / POSIX Privilege Level | 进程权限级别（此处指Process Loading Policy） |
| SPTM | Security Policy Transport Mechanism | 安全策略传输机制 |
| TXM | Transmission eXecution Monitor | 传输执行监控器 |
| TXN | Transactional Non-volatile storage | 事务型非易失性存储 |
| SEP | Secure Enclave Processor | 安全隔区处理器 |
| TCM | Trust Chain Model | 信任链模型 |
| JIT | Just-In-Time Compilation | 即时编译 |
| ROP | Return-Oriented Programming | 返回导向编程 |
| XPC | eXchange Processing Component | 进程间通信组件 |
| MIE | Memory Inertia Effects | 内存惯性效应 |
| EMTE | Execute-Memory-Transitive Enforcement | 执行-内存转换强制 |
| C2 | Command and Control | 命令与控制 |
| OTA | Over-The-Air | 空中下载（更新方式） |
| ACL | Access Control List | 访问控制列表 |
| IOMMU | Input-Output Memory Management Unit | 输入输出内存管理单元 |

---

**咨询iOS系统安全相关问题，请联系 Telegram：https://t.me/one00190**
