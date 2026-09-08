# /api/v1/compile — Public Compile Endpoint Spec

## Route

```
POST https://getrida.work/api/v1/compile
Content-Type: application/json
```

No auth header. Rate-limited at 10 requests/hour per IP (via Cloudflare rate limiting rules).

## Request

```json
{
  "mission": "I'm reviewing competitor pricing for our redesign",
  "tabs": [
    {
      "url": "https://example.com",
      "title": "Page Title",
      "description": "Meta description",
      "h1": "Main heading",
      "body": "First 3000 chars of body text",
      "pageType": "article",
      "ogTitle": "OG title",
      "canonical": "https://example.com/canonical"
    }
  ]
}
```

## Response (success)

```json
{
  "ok": true,
  "tabs": 37,
  "session_id": "20260710T235400Z-competitor-pricing-review",
  "monofile_preview": "...compiled markdown report...",
  "view_url": "/ops/tabbr/sessions/20260710T235400Z-competitor-pricing-review.md"
}
```

## Response (error)

```json
{
  "ok": false,
  "error": "Compile failed."
}
```

## LLM Prompt

System prompt fed to NVIDIA NIM GLM-5.1:

```
You are a tab compiler. The user has {N} browser tabs open and is working on: "{MISSION}".

For each tab, you receive: URL, title, description, h1, body text (first 3000 chars), and page type.

Produce a structured report in exactly 4 sections:

## SUMMARY
One paragraph synthesizing what all these tabs collectively represent.

## FINDINGS
Bulleted observations: patterns, contradictions, gaps, and notable content across the tab corpus.

## NEXT ACTIONS
Numbered, prioritized action items the user should take based on the tab corpus.

## KEEP vs CLOSE
Two subsections:
- KEEP: Tabs essential to the mission, each with a one-line reason.
- CLOSE: Tabs that are noise, duplicates, or irrelevant, each with a one-line reason. Include the full URL so it can be programmatically closed.
```

## Implementation

Add to `handleArtOfficial()` in the authoritative Worker at `CompanyOS/repos/companyos-edge-authoritative-impl/src/index.ts`:

```typescript
if (url.pathname === '/api/v1/compile' && request.method === 'POST') {
  return handlePublicCompile(request);
}
```

The `handlePublicCompile` function:
1. Parse JSON body (mission + tabs array)
2. Build the system prompt from the tab corpus
3. Call NVIDIA NIM (`https://integrate.api.nvidia.com/v1/chat/completions`, model `z-ai/glm-5.1`)
4. Generate session ID from timestamp + mission slug
5. Return `{ ok: true, session_id, monofile_preview, tabs: tabs.length }`
6. (Optional) Write monofile to GitHub via FS API for public viewing

No ADMIN_SECRET. No auth. Rate-limited via Cloudflare.