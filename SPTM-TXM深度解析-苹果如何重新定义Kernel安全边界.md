# SPTM/TXM深度解析：苹果如何重新定义Kernel安全边界——从“保护Kernel”到“限制Kernel信任”，iOS下一代安全架构演进

**文章定位**：iOS系统安全架构研究 / Apple Silicon安全机制 / XNU Kernel信任模型分析

**关键词**：SPTM、TXM、PPL、XNU、Kernel Trust Boundary、PAC、MIE、Exclaves、Secure Boot

**说明**：本文从防御和架构研究角度分析苹果安全设计，不涉及漏洞利用方法或攻击实现。

---

## 摘要

过去十多年，移动操作系统安全有一个核心假设：

Kernel是系统最高信任根。

也就是说：

```text
Application
  ↓
Sandbox
  ↓
Kernel
  ↓
Hardware
```

如果Kernel被攻破，攻击者通常可以获得极高权限。

因此，传统安全策略是：

保护Kernel，不让它被突破。

但是苹果近年来正在改变这个模型。

新的方向：

**即使Kernel出现问题，也不要让整个系统失去安全保证。**

这就是：

SPTM（Secure Page Table Monitor）

和

TXM（Trusted Execution Monitor）

出现的背景。

苹果官方安全文档指出，SPTM与TXM协同工作，用于保护用户和Kernel进程的页表，甚至在攻击者拥有Kernel写能力、绕过控制流保护的情况下继续维持安全策略。在支持的平台上，SPTM+TXM取代了传统PPL，并减少对Kernel本身的依赖。

---

## 第一章：传统Kernel安全模型的问题

### 1.1 Kernel为什么一直是攻击目标？

XNU Kernel负责：

* 进程管理；
* 内存管理；
* 驱动；
* 硬件访问；
* 权限控制。

结构：

```text
User Space
  ↓
Kernel Space
  ↓
Hardware
```

因此：

Kernel拥有：

最高权限。

历史攻击链：

```text
WebKit漏洞
  ↓
Sandbox Escape
  ↓
Kernel漏洞
  ↓
Kernel权限
  ↓
设备控制
```

这也是：

Pegasus、FORCEDENTRY、Coruna、Darksword等高级攻击链长期关注Kernel阶段的原因。

---

## 第二章：苹果安全架构演进路线

苹果并不是突然引入SPTM。

而是一系列演进。

### 第一阶段：ASLR

目标：

随机化内存布局。

降低：

地址预测。

### 第二阶段：PAC

Pointer Authentication Code。

目标：

保护控制流。

防止：

* 返回地址篡改；
* 函数指针修改。

### 第三阶段：KTRR

Kernel Text Read-only Region。

目标：

保护Kernel代码。

### 第四阶段：PPL

Page Protection Layer。

目标：

即使Kernel受到攻击，也保护关键页面。

### 第五阶段：SPTM/TXM

目标：

重新定义Kernel信任边界。

演进：

```text
保护Kernel代码
  ↓
保护Kernel数据
  ↓
保护Kernel之外的安全域
```

---

## 第三章：PPL时代的局限

### 3.1 PPL是什么？

PPL：

Page Protection Layer。

主要负责：

保护关键页面权限。

例如：

* 代码页面；
* 页表。

传统模型：

```text
Kernel
  ↓
管理自己的保护机制
```

问题：

如果：

Kernel本身失陷。

攻击者可能尝试：

影响保护机制。

因此苹果进一步减少：

“Kernel自我保护”。

---

## 第四章：SPTM是什么？

### 4.1 Secure Page Table Monitor

SPTM：

安全页表监控器。

核心思想：

把关键内存管理能力：

从Kernel中分离。

传统：

```text
Kernel
  拥有
    ↓
页表控制权
```

SPTM：

```text
SPTM
  拥有
    ↓
页表安全控制权

Kernel
  ↓
请求服务
```

苹果官方说明，SPTM运行在高于Kernel的权限层，并保护用户与Kernel进程的页表，降低Kernel失陷后进一步破坏系统完整性的能力。

---

## 第五章：TXM是什么？

### 5.1 Trusted Execution Monitor

TXM：

可信执行监控器。

主要关注：

代码执行策略。

包括：

* 代码签名；
* 权限策略；
* 执行控制。

简单理解：

SPTM负责：

“内存怎么映射”

TXM负责：

“什么代码可以运行”

结构：

```text
Application
  ↓
XNU Kernel
  ↓
TXM
  ↓
SPTM
  ↓
Hardware
```

---

## 第六章：SPTM与TXM如何协作？

核心关系：

不是平级。

而是：

**分层信任**。

模型：

```text
        Hardware
            ↑
          SPTM
            ↑
          TXM
            ↑
         Kernel
```

意义：

即使：

Kernel被攻破。

攻击者仍不能直接控制：

* 页表；
* 执行策略；
* 关键内存区域。

苹果文档指出，TXM的妥协不会自动导致SPTM被绕过，因为两者之间存在权限分离和信任隔离设计。

---

## 第七章：SPTM如何改变Exploit Chain？

### 7.1 传统攻击链

过去：

```text
WebKit
  ↓
Sandbox
  ↓
Kernel漏洞
  ↓
Kernel读写
  ↓
系统控制
```

### 7.2 SPTM时代

变化：

```text
WebKit
  ↓
Sandbox
  ↓
Kernel漏洞
  ↓
Kernel能力
  ↓
SPTM阻断进一步扩展
```

核心变化：

Kernel权限：

不再等于：

完全控制。

---

## 第八章：SPTM与PAC的关系

PAC：

保护：

控制流。

SPTM：

保护：

内存映射和权限边界。

两者结合：

```text
PAC
  ↓
防止错误跳转

SPTM
  ↓
防止错误内存权限变化
```

形成：

**控制流 + 内存边界双重保护**。

---

## 第九章：SPTM与MIE的关系

MIE：

Memory Integrity Enforcement。

目标：

保护内存完整性。

包括：

* EMTE；
* 安全分配器；
* Tag Confidentiality。

关系：

```text
SPTM
  ↓
保护内存权限

MIE
  ↓
保护内存内容完整性
```

两者结合：

降低：

* UAF；
* 类型混淆；
* 越界访问。

---

## 第十章：SPTM时代的XNU变化

传统：

XNU接近：

单一信任区域。

未来：

更像：

分层系统。

结构：

```text
        Secure World
             |
           SPTM
             |
           TXM
             |
           XNU
             |
      User Applications
```

一些安全研究认为，SPTM推动苹果逐步减少XNU作为唯一高权限信任域的角色，并为Exclaves等进一步隔离架构提供基础。

---

## 第十一章：Exclaves与未来方向

SPTM并不是终点。

苹果正在发展：

Exclaves。

目标：

把关键服务：

移出Kernel。

未来：

可能形成：

```text
App
  ↓
XPC/Mach
  ↓
Secure Service
  ↓
Exclave
  ↓
Hardware
```

这类似：

从：

**单体Kernel模型**

走向：

**微内核化安全模型**。

---

## 第十二章：商业间谍软件时代的影响

对于：

* Pegasus：
* Predator：
* Coruna：
* Darksword：

这类高级攻击。

最大价值：

来自：

Kernel突破。

SPTM改变：

攻击收益。

过去：

Kernel漏洞：

价值巨大。

现在：

Kernel漏洞：

只是第一步。

攻击者还需要面对：

* PAC；
* PPL/SPTM；
* MIE；
* Secure Boot；
* TXM。

---

## 第十三章：未来iOS安全模型

未来结构：

```text
Hardware Root of Trust
  ↓
Secure Monitor
  ↓
SPTM
  ↓
TXM
  ↓
Kernel
  ↓
Sandbox
  ↓
Application
```

核心思想：

不是：

“Kernel永远不会被攻破”。

而是：

**“Kernel失陷也无法摧毁整个系统”。**

---

## 总结

SPTM/TXM代表苹果安全架构的一次重大变化。

过去：

Kernel是最高信任根。

现在：

Kernel只是安全体系中的一个组件。

演进路线：

```text
保护Kernel
  ↓
限制Kernel
  ↓
隔离Kernel
  ↓
降低Kernel失陷影响
```

未来iOS安全竞争：

不会只是：

谁能找到Kernel漏洞。

而是：

谁能突破整个分层信任体系。

SPTM、TXM、MIE和Exclaves共同代表：

苹果从传统Kernel安全，

进入：

**硬件辅助、多域隔离、零信任Kernel时代**。

---

**咨询iOS系统安全相关问题，请联系 Telegram：https://t.me/one00190**
