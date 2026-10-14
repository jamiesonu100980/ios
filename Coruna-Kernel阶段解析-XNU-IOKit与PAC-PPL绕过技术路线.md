# Coruna Kernel阶段解析：XNU、IOKit、PAC/PPL绕过技术路线——从浏览器沙箱到 iOS 内核控制的最后一道防线

**说明**：Coruna 是一个 iOS 多阶段 Exploit Kit，公开分析显示其包含多个完整攻击链，覆盖 iOS 13.0～17.2.1，并组合使用 WebKit、PAC 绕过、Sandbox Escape、Kernel 提权以及 PPL 绕过等技术。本文从防御研究和架构理解角度分析其 Kernel 阶段。

---

## 一、为什么 Kernel 阶段是 Coruna 的核心？

前面的 WebKit 阶段解决：

“如何进入 iPhone？”

Kernel 阶段解决：

“如何控制 iPhone？”

现代 iOS 安全模型：

```text
Safari/WebContent
        |
        ↓
App Sandbox
        |
        ↓
Kernel
        |
        ↓
PPL/SPTM/硬件保护
```

攻击者必须逐层突破：

```text
浏览器权限
      ↓
用户空间权限
      ↓
Kernel权限
      ↓
绕过内核保护
      ↓
系统级控制
```

Coruna 的高级之处在于，它不是停留在浏览器代码执行，而是继续进入 XNU 内核安全边界。

---

## 二、Coruna Kernel阶段整体架构

可以抽象为：

```text
WebKit RCE
    ↓
PAC Bypass
    ↓
Sandbox Escape
    ↓
Kernel Exploit
    ↓
Kernel Read/Write
    ↓
PPL Bypass
    ↓
System Control
```

公开分析中，Coruna 的漏洞组件包含：

- WebKit RCE模块
- PAC绕过模块
- Sandbox Escape模块
- Kernel提权模块
- PPL绕过模块

共形成多条完整链。

---

## 三、XNU：iOS的核心内核

iOS 使用 Apple XNU 内核。

XNU结构：

```text
             User Space

   --------------------------------

             Kernel Space

          Mach Layer
               |
               |
          BSD Layer
               |
               |
          I/O Kit
               |
               |
          Drivers
```

主要组成：

### 1. Mach

负责：

- 进程通信
- Port机制
- 消息传递

### 2. BSD层

负责：

- 文件系统
- 网络
- 用户权限

### 3. IOKit

负责：

- 硬件驱动
- 用户态/内核态通信

攻击者关注：

**用户空间如何影响Kernel对象。**

---

## 四、Kernel Exploit的目标是什么？

很多人认为：

“Kernel漏洞 = 获得root”

实际上更复杂。

现代iOS：

```text
Kernel Code Execution

≠

完全控制系统
```

原因：

苹果增加多层保护。

攻击者通常需要：

**Kernel Memory Read/Write**

即：

内核读写能力。

概念：

```text
用户进程
      ↓
访问Kernel对象
      ↓
修改内核状态
```

这是后续绕过：

- PAC
- PPL
- Code Signing

的基础。

---

## 五、IOKit为什么成为攻击重点？

IOKit 是 iOS硬件抽象框架。

结构：

```text
Application
      ↓
User Client
      ↓
IOKit Service
      ↓
Kernel Driver
```

设计目标：

让App访问：

- GPU
- 摄像头
- 图形设备
- 网络设备

但边界复杂：

```text
User Space
        ↕
Kernel Space
```

任何：

- 参数验证错误
- 对象生命周期错误
- 类型错误

都可能成为攻击入口。

---

## 六、Coruna中的Kernel漏洞类型

公开分析显示，Coruna包含多个Kernel提权组件，例如：

| 组件 | 作用 |
| --- | --- |
| Neutron | Kernel Privilege Escalation |
| Pendulum | Kernel Privilege Escalation |
| Photon | Kernel漏洞 |
| Parallax | Kernel漏洞 |
| Gruber | Kernel漏洞 |

同时包含PPL绕过组件：

| 组件 | 作用 |
| --- | --- |
| Quark | PPL绕过 |
| Gallium | PPL绕过 |
| Carbone | PPL绕过 |
| Sparrow | PPL绕过 |
| Rocket | PPL绕过 |

---

## 七、PAC：第一道硬件级防线

**Pointer Authentication Code**

苹果从 A12 芯片开始大量使用。

目标：

保护：

- 返回地址
- 函数指针
- Objective-C Runtime关键指针

传统攻击：

```text
修改指针
      ↓
跳转恶意地址
```

PAC：

```text
指针
  +
认证签名
      ↓
验证通过
      ↓
执行
```

攻击者需要绕过：

```text
伪造指针
      ↓
生成有效认证
```

---

## 八、Coruna中的PAC绕过路线

公开分析显示：

Coruna包含专门PAC阶段，例如：

- Breezy
- Seedbell系列

作用：

连接：

```text
WebKit控制能力
      ↓
PAC保护环境
      ↓
继续Kernel阶段
```

---

## 九、PPL：Kernel之后的新防线

很多研究者误认为：

拿到Kernel权限 = 完全控制。

但苹果加入：

**Page Protection Layer（PPL）**

目的：

保护：

- 内核关键页面
- Code Signing状态
- 安全策略数据

架构：

```text
Kernel
      ↓
PPL保护区域
      ↓
关键安全状态
```

即使Kernel被攻破：

仍然需要突破PPL。

---

## 十、为什么需要PPL Bypass？

攻击链：

```text
Kernel漏洞
      ↓
Kernel Read/Write
      ↓
尝试修改安全状态
      ↓
PPL阻止
      ↓
需要PPL绕过
```

所以高级Exploit：

通常：

```text
Kernel Exploit
  +
PPL Bypass
```

组合出现。

---

## 十一、Coruna体现的“多层突破模型”

传统：

```text
漏洞
      ↓
权限
```

现代：

```text
WebKit漏洞
      ↓
浏览器控制
      ↓
PAC绕过
      ↓
Sandbox逃逸
      ↓
Kernel漏洞
      ↓
PPL绕过
      ↓
设备控制
```

每一层都有苹果设计的防御。

---

## 十二、为什么Coruna难度极高？

因为它需要同时解决：

### 1. 多版本兼容

iOS：

```text
13.x
      ↓
17.x
```

不同：

- Kernel结构
- 内存布局
- 安全策略

### 2. 多芯片适配

不同：

- A系列芯片
- ARM64架构差异

### 3. 多安全机制绕过

包括：

- ASLR
- PAC
- PPL
- Sandbox
- Code Signing

---

## 十三、Coruna与越狱工具的区别

越狱：

目标：

用户主动控制设备

Coruna：

目标：

远程无感控制设备

区别：

| 越狱 | Coruna |
| --- | --- |
| 用户操作 | 远程触发 |
| 公开工具 | 攻击框架 |
| 研究用途多 | 攻击用途强 |
| 长期社区维护 | 商业利用 |

---

## 十四、现代iOS Kernel研究趋势

未来重点：

### 1. 内存安全

减少：

- C/C++漏洞

### 2. 硬件隔离

研究：

- Secure Enclave
- SPTM
- Exclaves

### 3. 自动化漏洞发现

方向：

- AI辅助Fuzzing
- 自动代码审计
- Kernel状态分析

---

## 总结：Coruna Kernel阶段本质

Coruna真正强大的地方：

不是某一个Kernel漏洞。

而是：

```text
WebKit入口
      ↓
PAC突破
      ↓
Sandbox突破
      ↓
XNU Kernel控制
      ↓
PPL绕过
      ↓
完整设备控制
```

它代表了现代 iOS 攻击的最高形态：

**从“发现漏洞”发展到“设计一套跨版本、跨安全层的攻击系统”。**

---

**咨询iOS系统安全相关问题，请联系 Telegram：https://t.me/one00190**
