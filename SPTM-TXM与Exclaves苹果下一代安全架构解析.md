# SPTM、TXM与Exclaves：苹果下一代安全架构解析——从"保护Kernel"到"重新定义信任边界"的iOS安全演进

**文章定位**：Apple Platform Security / iOS内核安全 / 下一代系统隔离架构研究

**研究范围**：SPTM（Secure Page Table Monitor）、TXM（Trusted Execution Monitor）、Exclaves、XNU演进、硬件辅助隔离

**说明**：本文基于公开安全资料和研究分析，从架构层面讨论苹果安全设计，不涉及攻击实现或漏洞利用方法。

---

## 摘要

过去十多年，iOS安全体系建立在一个核心思想之上：

保护内核，让Kernel保持可信。

然而，随着移动设备功能越来越复杂，高级攻击技术不断发展，一个新的安全问题出现：

**如果攻击者成功突破Kernel怎么办？**

传统模型：

```text
Application
  ↓
Sandbox
  ↓
Kernel
  ↓
Hardware
```

在这种架构中：

Kernel拥有极高权限。

因此：

一旦Kernel被攻破，

整个系统安全可能受到影响。

近年来，苹果开始改变这一思路：

从：

> 保护Kernel

转向：

> 即使Kernel失陷，也保护关键安全组件。

这一变化体现在：

* **SPTM**（Secure Page Table Monitor）
* **TXM**（Trusted Execution Monitor）
* **Exclaves**

等新一代安全架构中。

苹果官方资料显示，SPTM与TXM用于保护用户态和内核态页面表，减少即使在Kernel具有写权限情况下的安全风险；在支持的芯片平台上，它们取代了此前的PPL（Page Protection Layer）。

---

## 第一章：传统iOS安全模型的问题

### 1.1 XNU Kernel长期作为核心信任区域

iOS基于：

XNU Kernel。

它融合：

* Mach微内核设计思想；
* BSD系统接口；
* I/O Kit驱动框架。

长期以来：

大量核心功能运行在Kernel信任范围内。

结构：

```text
       用户空间
          ↓
       XNU Kernel
          ↓
        Hardware
```

### 1.2 Kernel为什么成为攻击目标？

因为Kernel控制：

* 内存管理；
* 进程权限；
* 文件访问；
* 硬件接口。

攻击者如果获得Kernel级能力：

传统意义上意味着：

设备完全失陷。

因此过去大量iOS攻击链：

目标都是：

```text
WebKit
  ↓
Sandbox Escape
  ↓
Kernel Exploit
  ↓
Root权限
```

---

## 第二章：苹果安全架构演进路线

iOS安全并不是突然进入SPTM时代，而是逐步发展。

### 第一阶段：Sandbox隔离

目标：

限制App权限。

模型：

```text
App A
  ↓
Sandbox
  ↓
限制访问
```

解决：

应用之间互相攻击。

### 第二阶段：Kernel保护机制

苹果加入：

* ASLR；
* KASLR；
* Code Signing；
* AMFI。

目标：

增加Kernel攻击难度。

### 第三阶段：PPL时代

**Page Protection Layer**

PPL用于保护：

* 页面权限；
* 代码完整性；
* 页表修改。

核心思想：

即使Kernel被控制：

也限制关键内存修改。

### 第四阶段：SPTM/TXM/Exclaves时代

新的方向：

进一步拆分信任边界。

从：

```text
Kernel可信
  ↓
保护Kernel
```

变成：

```text
Kernel
  ↓
安全监控层
  ↓
硬件保护区域
```

---

## 第三章：SPTM —— Secure Page Table Monitor

### 3.1 SPTM是什么？

SPTM：

Secure Page Table Monitor。

可以理解为：

一个比Kernel更高信任等级的安全监控层。

苹果描述中，SPTM利用比Kernel更高权限的隔离机制，与TXM协同保护用户和Kernel页面表，即使攻击者获得Kernel写能力，也提高了修改关键内存的难度。

### 3.2 SPTM解决什么问题？

传统：

Kernel管理：

```text
Page Table
  ↓
Memory Permission
```

风险：

如果Kernel失陷：

攻击者可能修改：

* 内存映射；
* 页面权限；
* 执行权限。

SPTM：

引入：

独立控制层。

结构：

```text
Application
  ↓
Kernel
  ↓
SPTM
  ↓
Hardware Memory Protection
```

### 3.3 SPTM核心理念：内存重新分类

现代安全设计重点：

不是简单保护地址。

而是：

控制：

> "什么内存可以做什么"。

例如：

某些内存：

只能执行。

某些：

只能读取。

某些：

属于安全域。

SPTM通过更严格的内存域隔离思想，让不同安全组件拥有不同信任范围。相关研究分析指出，SPTM通过内存frame重新分类和映射规则建立安全域，从而降低XNU直接控制敏感区域的能力。

---

## 第四章：TXM —— Trusted Execution Monitor

### 4.1 TXM是什么？

TXM：

Trusted Execution Monitor。

主要负责：

* 代码签名验证；
* Entitlement策略；
* 执行信任判断。

传统模型：

```text
App启动
  ↓
Kernel检查
  ↓
允许执行
```

新模型：

```text
App
  ↓
TXM验证
  ↓
允许执行
```

### 4.2 为什么需要TXM？

因为：

Kernel本身可能成为攻击目标。

如果：

代码签名验证依赖Kernel。

那么：

Kernel失陷后：

安全机制可能失效。

TXM将部分信任决策从Kernel中分离。

苹果资料指出，TXM用于代码执行策略管理，使Kernel被攻破并不自动意味着攻击者可以执行任意代码。

---

## 第五章：Exclaves —— 安全隔离的新方向

### 5.1 什么是Exclaves？

Exclaves可以理解为：

运行在独立安全区域中的系统组件。

类似：

> "安全飞地"。

传统：

```text
App
  ↓
Kernel
  ↓
Service
```

Exclave：

```text
App
  ↓
接口调用
  ↓
Exclave
  ↓
安全服务
```

### 5.2 为什么需要Exclaves？

一些功能：

安全要求极高。

例如：

* 隐私指示；
* 敏感状态；
* 安全服务。

如果运行在普通系统环境：

Kernel攻击可能影响它们。

Exclaves目标：

即使：

XNU出现问题，

关键功能仍保持隔离。

---

## 第六章：从XNU到更强隔离架构

### 6.1 微内核化趋势

传统：

XNU：

大量功能集中。

未来：

逐渐拆分：

```text
Kernel
  ↓
Secure Components
  ↓
Independent Domains
```

这类似：

微内核思想。

不是：

所有东西都放在Kernel。

而是：

减少核心信任范围。

---

## 第七章：SPTM、TXM、Exclaves整体架构

可以抽象为：

```text
                 Hardware
                    ↑
                 SPTM
                    ↑
        ---------------------
        TXM        Exclaves
        ↑             ↑
        ---------------------
                 XNU Kernel
                    ↑
              User Applications
```

安全层级：

```text
用户层        App
  ↓
系统层        XNU
  ↓
安全监控层    TXM / Exclaves
  ↓
硬件保护层    SPTM
```

---

## 第八章：对未来iOS Exploit Chain的影响

过去攻击链：

```text
WebKit
  ↓
Sandbox Escape
  ↓
Kernel
  ↓
完成攻击
```

未来：

可能变成：

```text
WebKit
  ↓
Sandbox Escape
  ↓
Kernel
  ↓
仍需要突破
  ↓
SPTM/TXM/Exclaves
```

也就是说：

Kernel漏洞价值下降。

攻击者需要面对：

更多安全边界。

---

## 第九章：安全研究意义

### 9.1 攻击面变化

过去：

重点：

Kernel漏洞。

未来：

重点：

* Trust Boundary；
* IPC；
* 安全域通信；
* 权限设计。

### 9.2 防御思想变化

过去：

> "不要让Kernel被攻击。"

现在：

> "假设Kernel可能被攻击。"

这是现代安全架构的重要变化。

---

## 第十章：未来发展趋势

### 10.1 更多安全服务隔离

未来：

更多组件可能进入：

Exclave架构。

### 10.2 硬件支持增强

包括：

* 内存标签；
* 更强权限隔离；
* 新SoC安全功能。

### 10.3 Kernel地位变化

未来操作系统：

可能逐渐减少：

Kernel作为唯一信任核心。

---

## 结语

SPTM、TXM与Exclaves代表了苹果安全架构的重要转折。

过去：

Kernel是最后防线。

现在：

Kernel只是安全体系中的一个组件。

未来iOS安全模型正在从：

> "保护超级权限"

转向：

> "拆分超级权限"。

完整演进路线：

```text
Sandbox
  ↓
Kernel Protection
  ↓
PPL
  ↓
SPTM + TXM
  ↓
Exclaves
  ↓
多安全域架构
```

这意味着：

未来移动安全竞争，不再只是：

谁能找到Kernel漏洞。

而是：

谁能够突破越来越复杂的信任边界体系。

---

**咨询iOS系统安全相关问题，请联系 Telegram：https://t.me/one00190**
