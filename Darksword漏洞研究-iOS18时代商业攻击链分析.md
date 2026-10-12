# Darksword漏洞研究：iOS 18时代商业攻击链分析——从WebKit入口到XNU Kernel，再到SPTM时代的移动安全博弈

**文章定位**：iOS高级攻击链研究 / 商业间谍软件生态分析 / XNU安全架构演进

**关键词**：Darksword、iOS 18、WebKit、JavaScriptCore、PAC、Sandbox Escape、XNU、Kernel Exploit、SPTM、TXM

**说明**：本文基于公开威胁情报与安全研究资料，从防御和架构分析角度讨论Darksword，不涉及漏洞利用代码、攻击部署或武器化流程。

---

## 摘要

如果说：

* Pegasus代表了移动间谍软件商业化时代；
* Coruna代表了iOS 17时代高级Exploit Kit工程化；

那么：

**Darksword代表了iOS 18时代攻击链的新形态。**

公开安全研究显示，Darksword是一套针对iOS 18.4～18.7版本的完整攻击链，结合多个漏洞实现从浏览器入口到更高权限环境的跨越。Google Threat Intelligence Group（GTIG）披露，该攻击链包含多个漏洞组件，并被多个商业监控软件生态使用。

它体现了现代移动攻击的核心趋势：

过去：

```text
Kernel漏洞
  ↓
设备控制
```

现在：

```text
WebKit
  ↓
用户态执行
  ↓
Sandbox突破
  ↓
系统服务突破
  ↓
Kernel权限
  ↓
绕过更高安全边界
```

---

## 第一章：iOS 18时代的安全背景

### 1.1 为什么iOS 18攻击难度更高？

近年来苹果不断增强系统安全：

包括：

* Sandbox隔离；
* PAC指针认证；
* KTRR；
* PPL；
* kalloc_type；
* SPTM；
* TXM。

传统攻击：

```text
获得Kernel权限
  =
完成攻击
```

已经不再成立。

现代模型：

```text
Kernel
  ↓
PPL / SPTM
  ↓
硬件保护层
```

意味着：

攻击者即使突破Kernel，

仍然需要面对：

**更高等级安全边界。**

---

## 第二章：Darksword是什么？

### 2.1 定义

Darksword并不是单个漏洞。

它更接近：

**一个完整的iOS Exploit Chain框架。**

公开分析显示，Darksword支持iOS 18.4至18.7，并结合多个漏洞完成远程代码执行、沙盒突破以及最终权限提升。

其结构类似：

```text
Exploit Kit
├── Loader
│
├── WebKit入口
│
├── Sandbox Escape
│
├── Kernel阶段
│
└── Payload
```

---

## 第三章：Darksword攻击链总体结构

从安全研究角度，可以抽象为：

```text
恶意网页/水坑入口
  ↓
Safari/WebKit
  ↓
JavaScriptCore执行
  ↓
WebContent突破
  ↓
GPU Process突破
  ↓
系统服务权限
  ↓
XNU Kernel
  ↓
最终载荷
```

---

## 第四章：第一阶段——WebKit与JavaScriptCore入口

### 4.1 为什么攻击WebKit？

Safari是iOS最重要的攻击面之一。

原因：

WebKit包含大量复杂组件：

```text
WebKit
├── JavaScriptCore
├── WebCore
├── DOM
├── JIT
└── 图像解析
```

复杂系统意味着：

更多潜在漏洞。

### 4.2 JavaScriptCore的重要性

JavaScriptCore负责：

JavaScript执行。

现代攻击通常关注：

* JIT；
* 类型系统；
* 内存管理。

Darksword公开分析指出，其攻击链使用JavaScriptCore相关漏洞作为初始远程执行阶段。

---

## 第五章：第二阶段——PAC与现代控制流保护

### 5.1 PAC是什么？

PAC：

Pointer Authentication Code。

用于保护：

* 指针；
* 返回地址；
* 控制流。

传统攻击：

```text
修改指针
  ↓
改变执行流程
```

PAC之后：

```text
修改指针
  ↓
认证失败
```

### 5.2 Darksword面对的问题

现代iOS设备：

ARM64e架构。

因此：

高级攻击必须考虑：

* 指针认证；
* 内存权限；
* 执行限制。

公开研究显示，Darksword链中包含针对现代iOS安全机制的组件，例如与PAC相关的用户态安全边界处理。

---

## 第六章：第三阶段——Sandbox Escape

### 6.1 为什么必须逃逸Sandbox？

Safari WebContent进程：

不是完整系统权限。

它被限制：

* 文件访问；
* 系统调用；
* 进程交互。

因此攻击链需要：

```text
WebContent
  ↓
更高权限进程
```

### 6.2 多层Sandbox突破

Darksword体现现代攻击趋势：

不是一次突破。

而是：

**多级跳转。**

例如：

```text
WebContent
  ↓
GPU Process
  ↓
系统服务
  ↓
Kernel
```

---

## 第七章：第四阶段——XNU Kernel突破

### 7.1 Kernel为什么仍然重要？

虽然苹果增加：

* PPL；
* SPTM；

但Kernel仍然负责：

* 内存管理；
* 系统资源；
* 硬件接口。

因此：

Kernel漏洞仍然具有极高价值。

### 7.2 Darksword中的Kernel阶段

公开分析显示，Darksword包含XNU相关漏洞阶段，用于完成更高权限获取。

但新时代区别：

不是：

```text
Kernel = 终点
```

而是：

```text
Kernel = 通往更深层安全边界的一步
```

---

## 第八章：Darksword与Coruna对比

| 项目 | Coruna | Darksword |
| --- | --- | --- |
| 主要目标 | iOS 13-17时代 | iOS 18时代 |
| 入口 | 多种入口 | WebKit链 |
| 特点 | 多版本适配 | 新版iOS突破 |
| 安全重点 | PAC/PPL/SPTM | 现代Safari+Kernel链 |
| 代表意义 | 攻击链工程化 | 新时代浏览器到Kernel链 |

---

## 第九章：Darksword体现出的技术趋势

### 9.1 从漏洞到产品

现代商业攻击工具越来越像：

软件工程项目。

包含：

* 版本适配；
* 模块化；
* 自动判断；
* Payload管理。

### 9.2 从单点漏洞到链式突破

过去：

一个Kernel漏洞。

现在：

```text
多个漏洞组合
  ↓
完整攻击链
```

### 9.3 从Kernel竞争到信任边界竞争

未来：

攻击目标不只是：

Kernel。

而是：

```text
Kernel
  ↓
安全监控层
  ↓
硬件隔离区域
```

---

## 第十章：SPTM时代下的挑战

### 10.1 苹果的新安全模型

传统：

保护Kernel。

现代：

限制Kernel失陷影响。

**SPTM**：

Secure Page Table Monitor。

目标：

保护：

* 页面映射；
* 内存权限。

**TXM**：

Trusted Execution Monitor。

目标：

保护：

* 执行信任；
* 权限策略。

---

## 第十一章：如何防御Darksword类型攻击？

### 普通用户

**1. 保持系统更新**

高级攻击通常针对旧版本。

**2. 开启锁定模式**

高风险用户：

可考虑：

Lockdown Mode。

**3. 避免访问未知网站**

尤其：

* 针对性链接；
* 可疑网页。

### 企业环境

重点：

* MDM管理；
* 移动威胁检测；
* 网络监控；
* 日志分析。

---

## 第十二章：未来iOS攻击趋势

未来攻击链可能：

```text
WebKit
  ↓
AI组件
  ↓
系统服务
  ↓
安全域
  ↓
硬件隔离层
```

攻击者面对：

越来越多安全边界。

---

## 总结

Darksword的重要意义：

不只是一个漏洞集合。

它代表：

**iOS 18时代商业攻击链的新阶段。**

演进路线：

```text
Trident
  ↓
Pegasus
  ↓
FORCEDENTRY
  ↓
Coruna
  ↓
Darksword
  ↓
未来SPTM时代攻击链
```

核心变化：

过去：

找到Kernel漏洞。

现在：

构建完整跨边界攻击体系。

苹果的防御方向：

```text
减少Kernel权限
  ↓
增加隔离层
  ↓
强化硬件信任
```

未来移动安全竞争：

将围绕：

**高级攻击链工程能力**

与

**系统级信任边界防御能力**

展开。

---

**咨询iOS系统安全相关问题，请联系 Telegram：https://t.me/one00190**
