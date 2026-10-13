# 商业间谍软件终极图谱：Pegasus、Predator、Coruna、Darksword技术演进——从定向零点击攻击到工业化Exploit Chain生态

**文章定位**：移动安全威胁研究 / iOS高级攻击链演进 / 商业间谍软件生态分析

**关键词**：Pegasus、NSO Group、Predator、FORCEDENTRY、Coruna、Darksword、WebKit、Mach IPC、XNU Kernel、PAC、MIE、SPTM

**说明**：本文从安全研究和防御角度分析商业间谍软件发展，不涉及攻击部署、漏洞利用代码或操作流程。

---

## 摘要

过去十年，iPhone安全领域经历了一场深刻变化。

早期：

高级间谍软件属于少数国家级机构能力。

今天：

高级iOS Exploit Chain逐渐商业化、模块化，并开始向更多攻击组织扩散。

代表性演进路线：

```text
Pegasus
  ↓
Predator
  ↓
FORCEDENTRY
  ↓
Coruna
  ↓
Darksword
  ↓
MIE时代的新型攻击生态
```

这些案例展示了移动攻击技术的发展：

从：

单一漏洞利用

发展到：

**完整攻击链工程。**

典型现代链路：

```text
入口漏洞
  ↓
WebKit / 消息解析
  ↓
用户态执行
  ↓
Sandbox Escape
  ↓
Mach IPC边界突破
  ↓
Kernel漏洞
  ↓
权限提升
  ↓
数据访问
```

Google Threat Intelligence Group（GTIG）公开分析指出，Coruna与Darksword代表了iOS高级Exploit Chain向多组织复用和扩散的发展趋势，其中Darksword被观察到被多个商业监控供应商及疑似国家级组织使用。

---

## 第一章：商业间谍软件时代的开始——Pegasus

### 1.1 Pegasus的历史意义

2016年前后：

NSO Group开发的Pegasus成为全球关注焦点。

它改变了人们对手机攻击的理解：

攻击目标不再是：

普通恶意软件传播。

而是：

**精准监控。**

传统恶意软件：

```text
大量感染
  ↓
广告/盗窃
```

商业间谍软件：

```text
少量目标
  ↓
高价值信息获取
```

### 1.2 Pegasus早期技术特点

早期攻击链主要围绕：

* Safari/WebKit；
* iMessage；
* Kernel漏洞。

典型结构：

```text
消息入口
  ↓
解析漏洞
  ↓
代码执行
  ↓
权限提升
  ↓
监控能力
```

### 1.3 Pegasus带来的变化

它证明：

iPhone并非绝对安全。

真正高级攻击：

需要：

* 浏览器研究；
* Kernel研究；
* 系统架构理解。

---

## 第二章：零点击时代——FORCEDENTRY

### 2.1 什么是零点击攻击？

传统攻击：

需要用户：

点击链接。

零点击：

```text
收到消息
  ↓
系统自动处理
  ↓
漏洞触发
```

这类攻击最大特点：

用户几乎没有明显操作。

### 2.2 FORCEDENTRY的重要性

FORCEDENTRY展示：

攻击者可以利用复杂解析路径：

突破iMessage保护。

它推动苹果强化：

* BlastDoor；
* 沙盒隔离；
* 输入解析安全。

安全趋势发生变化：

苹果开始关注：

"不只是漏洞修复"。

而是：

**"降低漏洞形成攻击链的能力"。**

---

## 第三章：Predator——商业间谍生态扩张

### 3.1 从Pegasus到更多供应商

随着市场发展：

更多商业监控工具出现。

例如：

Intellexa相关生态中的Predator。

变化：

过去：

少数供应商。

现在：

多个商业攻击平台竞争。

### 3.2 Predator时代特点

攻击链更加：

模块化。

包括：

* Exploit模块；
* 控制服务器；
* Payload模块；
* 数据收集组件。

这意味着：

商业间谍软件越来越接近：

**"攻击平台"。**

---

## 第四章：Coruna——Exploit Kit工业化转折

### 4.1 Coruna代表什么？

Coruna的重要意义：

不是某一个漏洞。

而是一套：

**iOS Exploit Kit。**

它体现：

攻击能力商品化。

公开研究显示，Coruna被用于针对iOS设备的复杂攻击活动，并被观察到从商业监控生态扩散到更多攻击场景。

### 4.2 Coruna攻击链特点

抽象模型：

```text
WebKit入口
  ↓
JavaScript执行
  ↓
Sandbox突破
  ↓
Kernel阶段
  ↓
Payload
```

技术特点：

1. 模块化。
2. 支持多个iOS版本。
3. 具备自动化适配能力。

---

## 第五章：Darksword——iOS 18时代攻击链

### 5.1 Darksword出现背景

如果说：

Coruna代表：

iOS 17时代。

那么：

Darksword代表：

iOS 18时代。

GTIG分析显示，Darksword是一条完整iOS Exploit Chain，覆盖多个漏洞阶段，并支持iOS 18.4至18.7相关环境。

### 5.2 Darksword技术结构

现代抽象：

```text
Safari/WebKit
  ↓
JavaScriptCore
  ↓
PAC相关安全边界
  ↓
Sandbox Escape
  ↓
XNU Kernel
  ↓
最终Payload
```

涉及领域：

* WebKit；
* JavaScriptCore；
* dyld；
* Mach IPC；
* Kernel；
* 内存安全。

---

## 第六章：四代攻击链对比

| 时代 | 代表 | 核心特点 |
| --- | --- | --- |
| 2016-2019 | Pegasus | 高价值定向攻击 |
| 2019-2022 | FORCEDENTRY | 零点击时代 |
| 2021-2024 | Predator | 商业化扩张 |
| 2025以后 | Coruna | Exploit Kit工业化 |
| iOS 18时代 | Darksword | 多组织复用、现代链式攻击 |

---

## 第七章：技术演进路线

### 第一阶段：漏洞驱动

特点：

找到漏洞。

例如：

```text
漏洞
  ↓
利用
```

### 第二阶段：攻击链驱动

特点：

多个漏洞组合：

```text
漏洞A
  +
漏洞B
  +
漏洞C
```

### 第三阶段：平台工程化

现代：

```text
Exploit Framework
  ↓
自动适配
  ↓
版本判断
  ↓
Payload管理
```

---

## 第八章：为什么攻击链越来越难？

苹果近年来增加：

### 8.1 PAC

保护控制流。

### 8.2 PPL

保护关键内存。

### 8.3 kalloc_type

降低Kernel内存利用价值。

### 8.4 SPTM/TXM

降低Kernel作为唯一信任根的地位。

### 8.5 MIE

强化内存完整性。

安全模型：

过去：

```text
Kernel突破
  ↓
设备控制
```

现在：

```text
Kernel突破
  ↓
仍面对多层保护
```

---

## 第九章：MIE时代商业间谍软件会消失吗？

答案：

不会。

但生态会改变。

未来攻击者可能减少：

依赖：

* UAF；
* 类型混淆；
* 内存破坏。

转向：

1. 逻辑漏洞。
2. 身份攻击。
3. 供应链攻击。
4. 云端和账户体系攻击。

---

## 第十章：未来iOS攻击生态预测

未来高级攻击链：

可能变成：

```text
AI服务
  ↓
系统服务
  ↓
安全域
  ↓
硬件隔离区域
```

攻击目标：

从：

Kernel。

逐渐转向：

**信任边界。**

---

## 第十一章：商业间谍软件生态变化

未来可能出现：

### 1. Exploit-as-a-Service

漏洞能力服务化。

### 2. 攻击链租赁

类似：

云服务模式。

### 3. 更多自动化研究

AI辅助：

* 漏洞发现；
* 代码分析；
* 攻击面发现。

---

## 第十二章：终极演进图谱

```text
传统恶意软件
  ↓
Pegasus
  ↓
零点击攻击
  ↓
Predator商业生态
  ↓
Coruna Exploit Kit
  ↓
Darksword Full Chain
  ↓
MIE / SPTM时代
```

---

## 结语

商业间谍软件的发展，本质上是一场：

**攻击工程**

与

**安全架构**

之间的长期竞争。

过去：

谁拥有Kernel漏洞，谁拥有设备控制能力。

现在：

谁能够突破完整安全体系，谁才拥有真正能力。

Pegasus开启了移动间谍时代。

Predator推动商业化。

Coruna证明高级链可以工程化。

Darksword展示了iOS 18时代的新型攻击模式。

而MIE、SPTM、TXM代表苹果正在进入：

**"漏洞存在，但攻击链难以成立"的安全时代。**

---

**咨询iOS系统安全相关问题，请联系 Telegram：https://t.me/one00190**
