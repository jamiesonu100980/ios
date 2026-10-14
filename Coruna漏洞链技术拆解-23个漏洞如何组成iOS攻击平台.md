# Coruna漏洞链技术拆解：23个漏洞如何组成 iOS 攻击平台——从 WebKit RCE 到 Kernel 权限控制的现代 Exploit Framework 分析

**说明**：Coruna 是公开披露的一套 iOS Exploit Kit（漏洞利用平台）。Google Threat Intelligence Group（GTIG）分析显示，该框架包含 5条完整攻击链、23个独立漏洞组件，覆盖 iOS 13.0 到 iOS 17.2.1。本文从安全研究角度分析其架构设计和技术意义，不涉及可执行攻击方法。

---

## 一、Coruna不是“一个漏洞”，而是一套攻击平台

传统漏洞：

```text
Bug
  ↓
Exploit
  ↓
获得权限
```

Coruna采用的是现代商业攻击模式：

```text
设备识别
  ↓
选择对应漏洞链
  ↓
WebKit代码执行
  ↓
PAC绕过
  ↓
Sandbox逃逸
  ↓
Kernel权限提升
  ↓
加载Payload
```

它更接近：

**一个针对不同iOS版本自动选择攻击路线的漏洞编排系统。**

---

## 二、23个漏洞如何组成5条攻击链？

Coruna内部不是简单堆积漏洞，而是模块化组合：

```text
                 Coruna Framework
                        |
        -------------------------------
        |              |              |
   WebKit RCE     PAC绕过      Sandbox Escape
                        |
                  Kernel Exploit
                        |
                    Payload
```

根据公开分析：

- 5条完整Exploit Chain
- 23个漏洞模块
- 覆盖多个iPhone/iOS组合

---

## 三、第一层：设备指纹识别（Fingerprinting）

Coruna首先不会立即攻击。

它会判断：

- iPhone型号
- iOS版本
- 浏览器环境
- 芯片平台

逻辑：

```text
访问网页
  ↓
收集环境信息
  ↓
判断是否匹配
  ↓
选择对应攻击链
```

类似：

```text
iOS 17.2
      ↓
选择 cassowary

iOS 16.5
      ↓
选择 terrorbird
```

这种设计提高：

- 成功率
- 隐蔽性
- 利用效率

---

## 四、第一阶段：WebKit远程代码执行（RCE）

这是入口。

目标：

突破Safari/WebContent进程。

攻击结构：

```text
网页
  ↓
JavaScriptCore
  ↓
WebContent进程控制
```

Coruna包含多个WebContent读写组件：

| 模块 | 漏洞 | 目标版本 |
| --- | --- | --- |
| buffout | CVE-2021-30952 | iOS 13～15.1.1 |
| jacurutu | CVE-2022-48503 | iOS 15.2～15.5 |
| bluebird | 未公开CVE | iOS 15.6～16.1.2 |
| terrorbird | CVE-2023-43000 | iOS 16.2～16.5.1 |
| cassowary | CVE-2024-23222 | iOS 16.6～17.2.1 |

---

## 五、WebKit漏洞为什么重要？

Safari不是普通App。

它拥有：

- JavaScript引擎
- JIT编译器
- 大量C/C++组件

攻击面：

```text
JavaScript
  ↓
JavaScriptCore
  ↓
内存错误
  ↓
代码执行
```

常见漏洞类型：

### 1. 类型混淆

Type Confusion：

```text
对象A
  ↓
错误识别为对象B
  ↓
访问非法内存
```

### 2. Use After Free

生命周期错误：

```text
对象释放
  ↓
仍被引用
  ↓
攻击者控制执行流程
```

---

## 六、第二阶段：PAC绕过

现代iPhone使用：

**Pointer Authentication Code**

简称：

**PAC**

作用：

防止：

- 指针篡改
- 返回地址修改
- 控制流劫持

攻击链：

```text
WebKit控制
  ↓
遇到PAC保护
  ↓
需要绕过认证
  ↓
继续执行后续阶段
```

Coruna包含多个PAC绕过模块：

| 模块 | 版本 |
| --- | --- |
| breezy | iOS 13～14 |
| breezy15 | iOS 15～16.2 |
| seedbell | iOS 16.3～17.2.1 |

---

## 七、第三阶段：Sandbox Escape

获得WebContent控制：

不等于控制手机。

原因：

iOS Sandbox：

```text
Safari
  ↓
WebContent
  ↓
限制权限
```

攻击者需要：

突破：

```text
Browser Sandbox
  ↓
系统权限
```

Coruna包含：

- IronLoader
- NeuronLoader

等沙箱突破组件。

---

## 八、第四阶段：Kernel Exploit

这是整个攻击链的核心。

iOS内核：

**XNU Kernel**

负责：

- 内存管理
- 进程管理
- 权限控制
- 驱动管理

攻击目标：

```text
User Space
  ↓
Kernel Space
  ↓
Kernel权限
```

成功后可以影响：

- 系统安全策略
- 权限检查
- 内存保护

---

## 九、第五阶段：安全机制绕过

现代iOS还有：

### 1. ASLR

随机化内存地址。

目的：

阻止攻击者预测代码位置。

### 2. PAC

控制流保护。

### 3. PPL

保护关键页面。

### 4. SPTM

苹果新一代内存隔离机制。

高级攻击链必须：

```text
漏洞利用
  +
地址泄露
  +
保护绕过
  +
权限提升
```

才能完成。

---

## 十、Coruna的软件工程设计

Coruna最大的价值不是漏洞数量，而是工程化。

架构类似：

```text
Coruna
  ├── Fingerprint模块
  │
  ├── iOS版本判断
  │
  ├── Exploit选择器
  │
  ├── WebKit模块
  │
  ├── PAC模块
  │
  ├── Kernel模块
  │
  └── Payload加载模块
```

这和传统单漏洞PoC完全不同。

---

## 十一、为什么说Coruna接近“漏洞操作系统”？

因为它具备：

### 1. 自动适配

不同：

- iOS版本
- 芯片
- 安全配置

自动选择路径。

### 2. 模块组合

不是：

一个漏洞攻击所有设备。

而是：

```text
设备A
  ↓
Chain A

设备B
  ↓
Chain B
```

### 3. 长期维护能力

漏洞组件可以替换：

```text
旧WebKit漏洞
  ↓
新WebKit漏洞
```

保持平台生命力。

---

## 十二、Coruna与Pegasus时代攻击的区别

过去：

```text
找到零日
  ↓
制作利用
  ↓
攻击目标
```

现在：

```text
漏洞库
  +
自动选择
  +
攻击框架
  +
Payload系统
  =
商业化攻击平台
```

---

## 十三、Coruna攻击链总结图

```text
用户访问网页
      ↓
环境检测
      ↓
WebKit RCE
      ↓
获得浏览器执行能力
      ↓
PAC绕过
      ↓
Sandbox Escape
      ↓
Kernel Exploit
      ↓
系统权限
      ↓
Payload执行
```

---

## 十四、技术意义

Coruna代表三个趋势：

### 1. iOS漏洞进入工业化时代

漏洞不再单独出售，而是组成平台。

### 2. WebKit成为移动攻击入口核心

浏览器仍然是最大攻击面之一。

### 3. Kernel成为最终目标

真正高级攻击：

不是控制App。

而是：

**控制操作系统信任边界。**

---

## 总结

Coruna的核心价值不是“23个漏洞”，而是把23个漏洞工程化组合成了一台自动化 iOS 攻击机器。

它展示了现代移动安全攻防的最高形态：

```text
漏洞发现
      ↓
漏洞组合
      ↓
自动适配
      ↓
权限突破
      ↓
系统控制
```

---

**咨询iOS系统安全相关问题，请联系 Telegram：https://t.me/one00190**
