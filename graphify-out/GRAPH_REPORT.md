# Graph Report - E:/CLAUDE/SITE FCUTZ/trimsync  (2026-05-19)

## Corpus Check
- Corpus is ~7,641 words - fits in a single context window. You may not need a graph.

## Summary
- 23 nodes · 42 edges · 3 communities
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.78)
- Token cost: 62,965 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Landing Page & Visual Effects|Landing Page & Visual Effects]]
- [[_COMMUNITY_Legal Compliance & GDPR|Legal Compliance & GDPR]]
- [[_COMMUNITY_Product & API Integrations|Product & API Integrations]]

## God Nodes (most connected - your core abstractions)
1. `TrimSync Landing Page` - 16 edges
2. `TrimSync Terms of Service` - 8 edges
3. `TrimSync Data Deletion Instructions` - 8 edges
4. `TrimSync Privacy Policy` - 7 edges
5. `TrimSync SaaS Product` - 5 edges
6. `Motion@11 Animation Library` - 4 edges
7. `Bilingual EN/FR Language Toggle` - 4 edges
8. `Cormorant + DM Sans Fonts` - 4 edges
9. `felix@trimsync.tech Contact` - 4 edges
10. `Meta Instagram API Integration` - 3 edges

## Surprising Connections (you probably didn't know these)
- `Bricolage Grotesque + Figtree Fonts` --semantically_similar_to--> `Cormorant + DM Sans Fonts`  [INFERRED] [semantically similar]
  trimsync/index.html → trimsync/privacy.html
- `TrimSync Terms of Service` --references--> `Flat 99/Month Pricing Model`  [EXTRACTED]
  trimsync/terms.html → trimsync/index.html
- `TrimSync Landing Page` --references--> `TrimSync Privacy Policy`  [EXTRACTED]
  trimsync/index.html → trimsync/privacy.html
- `TrimSync Landing Page` --references--> `TrimSync Terms of Service`  [EXTRACTED]
  trimsync/index.html → trimsync/terms.html
- `TrimSync Landing Page` --references--> `TrimSync Data Deletion Instructions`  [EXTRACTED]
  trimsync/index.html → trimsync/data-deletion.html

## Hyperedges (group relationships)
- **TrimSync Legal Pages Cross-Linked Cluster** — trimsync_privacy, trimsync_terms, trimsync_datadeletion, trimsync_gdpr [EXTRACTED 1.00]
- **TrimSync External API Integrations** — trimsync_brand, trimsync_instagram_api, trimsync_google_calendar, trimsync_stripe, trimsync_openai [EXTRACTED 1.00]
- **Motion@11-Powered Visual Effects** — trimsync_motion11, trimsync_shadow_overlay, trimsync_scroll_reveals, trimsync_magnetic_buttons [EXTRACTED 1.00]

## Communities (3 total, 0 thin omitted)

### Community 0 - "Landing Page & Visual Effects"
Cohesion: 0.27
Nodes (10): Bricolage Grotesque + Figtree Fonts, TrimSync Landing Page, Magnetic Button Effect, Motion@11 Animation Library, Animated Orb Background, Flat 99/Month Pricing Model, Scroll Reveal Animations, Fixed Section Nav Dots (+2 more)

### Community 1 - "Legal Compliance & GDPR"
Cohesion: 0.71
Nodes (7): felix@trimsync.tech Contact, TrimSync Data Deletion Instructions, Cormorant + DM Sans Fonts, GDPR Compliance Framework, Bilingual EN/FR Language Toggle, TrimSync Privacy Policy, TrimSync Terms of Service

### Community 2 - "Product & API Integrations"
Cohesion: 0.33
Nodes (6): TrimSync SaaS Product, Live DM Demo Chat Animation, Google Calendar API Integration, Meta Instagram API Integration, OpenAI AI Model, Stripe Payment Processing

## Knowledge Gaps
- **6 isolated node(s):** `Google Calendar API Integration`, `Stripe Payment Processing`, `OpenAI AI Model`, `Animated Orb Background`, `Text Scramble Hero Effect` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TrimSync Landing Page` connect `Landing Page & Visual Effects` to `Legal Compliance & GDPR`, `Product & API Integrations`?**
  _High betweenness centrality (0.747) - this node is a cross-community bridge._
- **Why does `TrimSync SaaS Product` connect `Product & API Integrations` to `Landing Page & Visual Effects`?**
  _High betweenness centrality (0.273) - this node is a cross-community bridge._
- **Why does `TrimSync Data Deletion Instructions` connect `Legal Compliance & GDPR` to `Landing Page & Visual Effects`, `Product & API Integrations`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **What connects `Google Calendar API Integration`, `Stripe Payment Processing`, `OpenAI AI Model` to the rest of the system?**
  _6 weakly-connected nodes found - possible documentation gaps or missing edges._