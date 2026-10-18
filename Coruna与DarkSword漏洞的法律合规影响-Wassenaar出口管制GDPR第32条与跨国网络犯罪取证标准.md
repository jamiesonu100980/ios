# Coruna 与 DarkSword 漏洞的法律合规影响：Wassenaar 出口管制、GDPR 第 32 条与跨国网络犯罪取证标准

**文档类型：** 网络安全研究报告  
**研究对象：** Coruna 漏洞 / DarkSword 漏洞  
**目标读者：** 移动端安全分析师、反间谍软件研究者、企业 MDM 管理员  
**研究原则：** 仅基于公开技术材料做防御视角分析；区分"已证实 / 技术推断 / 未验证假设"三个层级；不编写可复现的利用代码  
**说明：** 本报告不构成任何攻击建议或操作指引

---

## 摘要

Coruna 和 DarkSword 这类零点击 exploit 工具的研发、销售和部署涉及多层次的法律与监管框架。从 Wassenaar Arrangement 对"高级加密"和"入侵检测系统"组件的出口管制要求，到欧盟 GDPR Article 32 对个人数据处理安全的强制性义务，再到 ISO/IEC 27001 A.5.26 的安全控制映射以及跨国刑事司法中的证据认证难题——这些法律机制共同构成了一个错综复杂的合规矩阵。本报告系统地梳理了每一层法律框架如何适用于 iOS spyware 威胁场景，指出了当前法律体系中的空白与挑战，并提出了针对组织合规实践的改进建议。

---

## 一、Wassenaar Arrangement 出口管制框架

### 1.1 Wassenaar 与 spyware 工具的关联

《瓦森纳安排》（Wassenaar Arrangement）是多边常规武器及军民两用物品的出口管制协定，于 2018 年新增了针对 cyber 产品的清单（Category 5, Part 2）：

```text
Category 5, Part 2 — "Information Security" Systems
├─ Item 2A011: Information security systems designed or modified to attack
├─ Item 2E001: Technology for development or production of 2A011 items
└─ Item 2A004: Information security software designed to bypass security controls
```

**已证实：** NSO Group 等 spyware 供应商的产品已被多个成员国列入国家出口许可清单。这意味着出口此类工具需要事先获得政府审批。**技术推断：** Coruna 和 DarkSword 如果属于同一类 spyware vendor 产品序列，理论上同样受 Category 5 Part 2 约束。

### 1.2 执法例外（LE-exemption）争议

Wassenaar 框架允许成员国在向经过认证的执法机构销售时使用简化程序（LE-exemption）。然而这一机制引发了以下问题：

| 争议点 | 描述 |
|--------|------|
| 客户审核不足 | LE-exemption 下的买方是否真的都是合法执法机构？ |
| 转售监控缺失 | 获授权的国家是否会再将工具转售给非认证实体？ |
| end-use verification | 是否存在终端使用核查机制？ |

**未验证假设：** 有调查报道称某些被认定为执法机构的实体实际上用于政治监控而非犯罪调查，但这缺乏正式法律认定。

### 1.3 出口管制的实际效力评估

| 限制维度 | 效力评估 |
|---------|---------|
| 技术出口物理边界 | ⚠️ 中等 — digital goods 跨境传输难以追踪 |
| 开发人才流动 | ❌ 低 — 开发者可通过 freelance/consulting 模式绕过 |
| 云端基础设施依赖 | ⚠️ 中等 — CDN/cloud provider ToS 可能禁止 spyware 用途 |
| 加密货币支付流通 | ❌ 低 — 难以溯源和阻断 |

---

## 二、GDPR Article 32 数据安全措施义务

### 2.1 GDPR Art. 32 核心要求

《通用数据保护条例》（GDPR）第 32 条规定了处理个人数据的控制者和处理者必须实施的适当技术与组织措施：

```text
Art. 32(1) Requirements:
├─ a) Pseudonymization and encryption of personal data
├─ b) Confidentiality, integrity, availability resilience of processing systems
├─ c) Ability to restore availability following incident
├─ d) Regular testing/assessment of security measures effectiveness
└─ e) Assurance of expert access to personnel
```

### 2.2 当 iOS 设备被 Coruna/DarkSword 入侵时 Art. 32 的适用性

**已证实：** 如果企业为其员工提供 iOS 设备（BYOD 或 CDE — Corporate Deployed Equipment），则该企业作为数据控制者（data controller）负有保护设备上所有个人数据的责任。包括：电子邮件内容、通讯录、聊天记录、位置数据等。

**关键合规问题 1 — Encryption (Art. 32(1)(a))：**

Keychain 中的数据即使被窃，SE（Secure Enclave）仍然保护着加密密钥。但以下数据可能被明文获取：
- iCloud 备份中未启用端到端加密的部分
- App 内以明文存储的 credentials
- Notification preview 缓存中的消息文本

```text
Compliance assessment:
✓ Keychain data protected by SE → meets encryption requirement
✗ Notification content cached in plaintext → partial failure
✗ iCloud backup without E2EE → depends on user settings (often not configured)
⚠ App-level storage encryption → app-dependent, organization has limited control
```

**关键合规问题 2 — Resilience (Art. 32(1)(b))：**

PPL 和 Sandbox 理论上应该防止横向移动。但当它们被绕过时：

| 要求 | 达标状态 | 差距 |
|------|---------|------|
| System availability resilience | ⚠️ Partial | 系统本身未被中断，但数据完整性受损 |
| Data integrity protection | ✗ Failed | 一旦权限提升完成，数据完整性无法维持 |
| Intrusion detection capability | ✗ Insufficient | iOS 无原生实时入侵检测能力 |

### 2.3 GDPR 数据泄露通知义务的影响

**已证实：** GDPR 第 33 条要求在发现数据泄露后 72 小时内向监管机构报告。对于 Coruna/DarkSword 类攻击，由于隐蔽性极强，组织可能在数周甚至数月后才察觉到入侵。

**技术推断：** 这意味着大多数组织在满足 72 小时报告窗口之前就已经超过了时限。这可能使组织面临双重处罚风险——既因入侵本身，也因未及时报告。**未验证假设：** 未来是否有专门针对 mobile device compromise 的通知豁免条款，目前未见讨论。

---

## 三、ISO/IEC 27001 与 Mobile Threat Alignment

### 3.1 ISO 27001 A.5.26（移动设备管理）的适用

ISO/IEC 27001:2022 Control A.5.26 专门针对移动设备的安全管理：

```text
A.5.26 Mobile device management
Objective: To ensure secure use of mobile devices under the organization's control.

Controls include:
├─ Policy for acceptable use of mobile devices
├─ Encryption of stored data on mobile devices
├─ Limitation of functions available on unmanaged devices (BYOD)
├─ Awareness of mobile threats and attack vectors
└─ Incident response procedures covering mobile device compromise
```

### 3.2 A.5.26 与 Coruna/DarkSword 的具体映射

| ISO Control | Coruna 威胁映射 | DarkSword 威胁映射 | 控制有效性 |
|------------|----------------|-------------------|-----------|
| Acceptable use policy | 水坑攻击绕过政策（用户访问恶意网站） | MDM 配置欺骗（安装恶意配置文件） | 有限 |
| Data encryption | Keychain encryption 提供一定保护 | VFS 路径上明文文件仍可读取 | 部分有效 |
| Function limitation | JIT 功能本身是 Apple 有意开放的 | Background task 被滥用 | 需缩小攻击面 |
| Threat awareness | 员工通常 unaware of zero-click risk | 同上 | 需增强培训 |
| Incident response | 缺少 mobile-specific IR playbook | 缺少 mobile-specific IR playbook | 需新建 |

**技术推断：** 大多数组织的 ISO 27001 ISMS 覆盖了"mobile device management"，但很少深入具体的 attack scenario。将 Coruna/DarkSword 级别 threat纳入风险评估模型是当前最大的合规缺口之一。

### 3.3 MTP+（Mobile Trust Platform+）认证路径

MTP+ 是由 The Open Group 推出的移动信任平台认证框架，专门针对移动安全成熟度进行评估。对于高安全需求的组织（如金融服务、国防承包），建议同时采用 MTP+ Level 3+ 认证以补充 ISO 27001 的不足：

```text
MTP+ Assessment Dimensions:
├─ Device posture assessment (real-time compliance checking)
├─ Application allowlisting (code signing enforcement)
├─ Network traffic inspection (C2 domain blocking)
├─ Behavioral analytics (unusual process patterns)
└─ Automated remediation (isolate + wipe compromised device)
```

---

## 四、刑事追诉的证据标准

### 4.1 数字证据认证的国际标准对比

不同法域对数字证据的可采性有着不同的要求：

| 法域 | 证据规则 | 数字证据特定要求 | 适用挑战 |
|------|---------|----------------|---------|
| 美国（联邦） | FRE Rule 901 | Authentication via hash comparison, chain of custody | 跨州/跨国证据链断裂 |
| 欧盟（E-evidence） | Regulation 2022/1922 | eIDAS Regulation 电子识别 | Spyware 生成的证据合法性争议 |
| 中国 | 刑事诉讼法第 50 条 | 电子数据需保证完整性、不得篡改 | 司法鉴定资质门槛 |
| 国际刑事法院 | Rome Statute Art. 69 | Relevance + probative value > prejudice | Nation-state attribution 的政治敏感性 |

### 4.2 Coruna/DarkSword 攻击事件中的取证难题

**已证实：** 在真实的间谍软件调查中，以下证据类型最为关键但最难获取：

```yaml
forensic_evidence_challenges:
  memory_dump:
    challenge: "exploit runs entirely in memory; no disk artifacts initially"
    solution_status: "Requires immediate RAM acquisition before reboot"
    
  keychain_access_log:
    challenge: "encrypted; only decrypted at runtime by SE"
    solution_status: "No known method to extract decrypted contents post-compromise"
    
  network_capture:
    challenge: "QUIC/TLS encrypted; C2 servers may be behind CDN/fraudulent front domains"
    solution_status: "DNS logs from ISP or enterprise proxy can provide indirect evidence"
    
  attribution_data:
    challenge: "Infrastructure often distributed across multiple jurisdictions"
    solution_status: "Open-source intelligence (OSINT) + HUMINT needed"
```

### 4.3 证据保全的黄金时间窗口

```text
T+0:   Compromise detected (or suspected)
T+5min: Isolate device (airplane mode / Faraday bag) ← CRITICAL WINDOW
T+30min: Acquire volatile data (RAM dump, running processes, network connections)
T+2h:   Acquire persistent data (file system image, keychain export if possible)
T+24h:  Begin legal documentation (chain of custody log, warrant preparation)
T+72h:  First report to authorities (GDPR 72-hour window still applies for notification)
```

**技术推断：** 对于零点击攻击，黄金时间窗口极短——因为一旦 attacker 知道设备被标记隔离，可以远程销毁 payload。**未验证假设：** Apple 的 CrashReporter 或 Diagnostics 日志是否天然包含了 exploit 执行期间的内存快照信息，目前尚无公开确认。

---

## 五、跨国管辖权与协调挑战

### 5.1 典型的跨国司法冲突图景

```
Scenario: Infrastructure in Country A, victim in B, vendor in C, relay via D/E/F

Legal conflicts:
├─ Jurisdiction dispute: Which laws apply?
├─ Evidence delay: MLAT takes 6-18 months
├─ Export gap: Country C may not enforce Wassenaar
├─ Data localization: Country B's data cannot leave borders
└─ Diplomatic pressure: If Country C is strategic ally
```

### 5.2 现有国际协作机制及其局限

| 机制 | 覆盖范围 | 在 spyware 案件中的实际效能 |
|------|---------|---------------------------|
| MLAT（刑事司法协助条约） | 双边/多边 | 慢（6-18 个月）、成本高 |
| Budapest Convention on Cybercrime | 跨境数字取证 | 缔约国有限，不包含所有 spyware 高发地区 |
| TAILOR / TLP 情报共享 | 运营层面信息共享 | 不涉及司法追诉 |
| INTERPOL Notices & Operations | 跨国执法协调 | 依赖成员国自愿配合 |
| EU-E-U.S. Data Privacy Framework | 数据传输合规 | 不直接解决 spyware 问题 |

**技术推断：** 针对 nation-state-linked spyware，最有效的协作途径可能是通过外交渠道进行非正式的压力施压，而非依靠正式的法律程序。然而这种方式的成本和可预测性都较高。**未验证假设：** 建立专门的 international mobile spyware prosecution task force 可能在效率上优于现有的碎片化机制，但目前尚无先例。

---

## 六、组织合规实践建议

### 6.1 三层级合规行动框架

| 层级 | 行动项 | 时间线 |
|------|-------|--------|
| L1 基础合规 | 审查 ISO 27001 A.5.26 执行情况、更新 mobile use policy | 0-30 天 |
| L2 强化控制 | 部署 MTP+ 级别的设备行为监控、实施 GDPR Art.32 增强加密 | 30-90 天 |
| L3 应急响应 | 建立 mobile-specific IR playbook、与 CERT 建立 direct reporting line | 90-180 天 |

### 6.2 法律风险评估自检表

```text
□ 我们的组织是否符合 Wassenaar Arrangement 成员国身份？是否需要申请出口许可证？
□ 我们收集的个人数据类型是否落入 GDPR Scope？跨境传输是否需要 SCCs？
□ 我们的 ISO 27001 ISMS 是否覆盖了 mobile device specific threats？
□ 我们的 Incident Response Playbook 是否包含 mobile device compromise scenario？
□ 我们与外部法律顾问的关系是否能够应对跨境 cybercrime investigation？
□ 我们的保险策略是否涵盖 spyware 导致的 data breach liability？
```

---

## 七、总结

Coruna 与 DarkSword 这类高级 iOS exploit 工具不仅是技术问题，也是法律问题。它们在技术层面的成功依赖于对多重安全机制的同时突破，而在法律层面则利用了监管体系中的多个灰色地带：出口管制的执法缝隙、GDPR 的时效瓶颈、跨境取证的延迟周期以及 nation-state 背景带来的政治豁免预期。

**对组织和治理者的核心建议：**
1. 将 mobile threat landscape 明确纳入企业信息安全风险评估矩阵
2. 审计现有的 ISMS 控制集在移动端的覆盖盲区
3. 确保 Incident Response 流程中包含 mobile device isolation 的标准化步骤
4. 与具备国际 cybercrime 经验的法律顾问建立合作关系
5. 了解所在国家在 Wassenaar Arrangement 下的具体立法转化情况

**咨询iOS系统安全相关问题，请联系 Telegram：https://t.me/one00190**
