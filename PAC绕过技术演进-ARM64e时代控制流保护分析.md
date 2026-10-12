# PAC绕过技术演进：ARM64e时代控制流保护分析——从Pointer Authentication出现，到现代iOS Exploit Chain中的安全博弈

**文章定位**：ARM64e安全机制研究 / iOS Kernel安全 / 控制流完整性分析

**关键词**：PAC、Pointer Authentication Code、ARM64e、A12、ROP、JOP、CFI、KTRR、PPL、SPTM、TXM

**说明**：本文从防御研究角度分析PAC机制、历史安全挑战和架构演进，不涉及绕过实现方法、攻击代码或利用流程。

---

## 摘要

2018年，苹果在A12芯片平台引入ARM64e架构，并将：

**Pointer Authentication Code（PAC）**

作为iOS安全体系的重要组成部分。

PAC改变了移动设备安全模型。

过去：

攻击者利用内存破坏：

```text
修改控制数据
  ↓
改变程序执行路径
```

现代：

```text
修改指针
  ↓
PAC认证失败
  ↓
系统阻断执行
```

苹果官方文档指出，ARM64e架构通过PAC对指针增加密码学认证信息，用于检测内存中的指针是否被异常修改，从而增强控制流完整性。

但是：

PAC并不是绝对防御。

它改变的是：

**攻击成本。**

因此，过去几年iOS安全研究经历：

```text
无PAC时代
  ↓
PAC初代部署
  ↓
PAC安全分析
  ↓
数据流攻击研究
  ↓
PPL/SPTM时代综合防御
```

---

## 第一章：为什么需要PAC？

### 1.1 内存破坏攻击问题

长期以来：

软件漏洞主要来自：

* Buffer Overflow；
* Use After Free；
* Type Confusion。

攻击者目标：

修改关键控制数据。

例如：

* 返回地址；
* 函数指针；
* 虚函数表。

传统攻击模型：

```text
Memory Corruption
  ↓
修改指针
  ↓
控制执行流程
```

### 1.2 ROP与JOP时代

#### ROP（Return-Oriented Programming）

攻击者不需要注入代码。

而是：

重新组合已有代码片段。

模型：

```text
函数A
  ↓
返回地址
  ↓
函数B
  ↓
函数C
```

#### JOP（Jump-Oriented Programming）

类似思想：

利用：

* 函数指针；
* 间接跳转。

苹果指出，PAC主要用于降低这类控制流攻击风险，包括ROP和JOP等依赖修改控制流数据的攻击方式。

---

## 第二章：ARM64e与PAC基础

### 2.1 ARM64e是什么？

ARM64e是苹果基于ARM架构扩展的安全ABI。

主要用于：

* iPhone A系列芯片；
* Apple Silicon设备。

支持：

硬件级指针认证。

### 2.2 PAC工作思想

简单理解：

普通指针：

```text
Pointer
```

PAC保护后：

```text
Pointer + Authentication Code
```

结构：

```text
高位区域
  ↓
PAC信息
  ↓
地址信息
```

CPU执行：

写入：

```text
Pointer
  ↓
生成PAC
  ↓
保存
```

读取：

```text
读取Pointer
  ↓
验证PAC
  ↓
通过/拒绝
```

如果指针被修改：

认证失败。

系统认为：

可能发生内存破坏。

---

## 第三章：PAC保护哪些对象？

### 3.1 返回地址

保护：

函数调用返回。

目标：

降低ROP风险。

### 3.2 函数指针

例如：

callback pointer

防止：

非法跳转。

### 3.3 C++虚函数

C++对象：

依赖：

vtable。

PAC可以保护：

虚函数调用路径。

### 3.4 Kernel对象

在iOS Kernel环境：

PAC用于保护关键指针。

例如：

* 内核函数指针；
* 对象引用。

---

## 第四章：PAC时代之前的Kernel攻击

### 4.1 传统模型

早期iOS：

攻击链：

```text
漏洞
  ↓
任意读写
  ↓
修改Kernel数据
  ↓
执行控制
```

核心目标：

控制：

函数指针。

### 4.2 PAC改变了什么？

以前：

获得内存写能力：

风险极高。

现在：

即使：

能够修改数据，

还需要面对：

指针认证。

攻击难度提高。

---

## 第五章：PAC安全研究的发展

### 5.1 初期研究：理解认证机制

PAC出现后：

研究重点：

* 密钥模型；
* 签名方式；
* 上下文绑定。

Project Zero曾分析iPhone XS上的PAC实现，研究了苹果对ARM Pointer Authentication的具体实现以及其安全边界。

### 5.2 从控制流攻击转向数据攻击

PAC主要保护：

控制流。

但是：

攻击者开始关注：

数据。

例如：

修改：

* 权限状态；
* 配置结构；
* 安全判断数据。

形成：

**Data-Oriented Attack**

即：

不改变执行流程。

而改变：

程序逻辑。

---

## 第六章：PAC与Kernel Exploit演进

### 6.1 iOS 11-12时期

重点：

PAC出现。

攻击研究：

围绕：

如何适应新的控制流保护。

### 6.2 iOS 13-14时期

苹果加入：

* KTRR；
* PPL。

安全模型：

进一步强化。

结构：

```text
Kernel
  ↓
PPL
  ↓
Protected Memory
```

### 6.3 iOS 15以后

进一步加入：

kalloc_type。

目标：

降低：

* UAF；
* 类型混淆。

苹果安全研究团队指出，kalloc_type通过类型隔离提高Kernel内存安全，使大量传统内存破坏漏洞更难转化为有效攻击。

---

## 第七章：PAC绕过研究的核心方向（高层）

现代研究并不是简单：

"破解PAC"。

更多关注：

### 7.1 实现错误

PAC本身安全。

但：

软件使用方式可能产生问题。

例如：

* 错误上下文；
* 不正确验证；
* 错误对象设计。

### 7.2 密钥隔离

研究关注：

不同环境：

如何隔离：

认证密钥。

### 7.3 签名上下文

PAC安全依赖：

```text
Pointer
  +
Key
  +
Discriminator
```

苹果文档指出，PAC认证不仅依赖指针值，还结合密钥和额外上下文（discriminator），用于降低有效指针被错误复用的风险。

---

## 第八章：PAC与JIT安全

现代浏览器：

例如：

JavaScript引擎。

大量使用：

JIT。

问题：

JIT需要：

动态生成代码。

苹果针对JIT环境加入：

* 写保护；
* PAC保护；
* 权限切换机制。

苹果文档说明，在arm64e环境中，JIT相关代码区域也可以利用PAC保护关键指针和执行路径。

---

## 第九章：PAC与现代Exploit Chain

过去：

```text
WebKit
  ↓
Kernel
  ↓
完成
```

现在：

```text
WebKit
  ↓
Sandbox Escape
  ↓
Kernel
  ↓
PAC
  ↓
PPL
  ↓
SPTM/TXM
```

攻击者需要突破：

多个安全层。

---

## 第十章：SPTM时代PAC的位置

PAC不是终点。

它属于：

整个安全体系的一层。

现代苹果安全模型：

```text
控制流保护
  ↓
PAC
```

```text
内存保护
  ↓
kalloc_type
```

```text
Kernel隔离
  ↓
PPL
```

```text
更高信任层
  ↓
SPTM/TXM
```

未来：

PAC可能继续存在。

但作用：

从单独防御：

变成：

**多层安全体系的一部分。**

---

## 第十一章：未来ARM64e安全趋势

### 11.1 更强硬件辅助安全

方向：

* 内存完整性；
* 类型安全；
* 执行隔离。

---

## 总结

PAC是iOS安全历史中的重要转折点。

它改变了：

攻击者获得内存写能力后的价值。

演进路线：

```text
传统内存破坏
  ↓
ROP/JOP时代
  ↓
PAC控制流保护
  ↓
PPL内核隔离
  ↓
SPTM/TXM安全域
```

核心变化：

过去：

控制Kernel，就控制设备。

现在：

控制Kernel，也必须面对多层安全边界。

ARM64e时代的安全竞争：

已经从：

漏洞发现

进入：

**硬件、编译器、Kernel、安全架构共同防御时代。**

---

**咨询iOS系统安全相关问题，请联系 Telegram：https://t.me/one00190**
