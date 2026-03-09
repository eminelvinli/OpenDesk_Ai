# Skill: Exact Keyword Extraction (DeepSeek)

## Description
Extract high-value ASO keywords from App metadata using DeepSeek AI.
Handles **Brand Separation**, **Localization**, and **ClickHouse Persistence**.

## When to Use
- Finding keywords for a specific app
- Analyzing competitor ASO strategies
- Building features requiring raw keyword data

## Dependencies
| Component | Path |
|-----------|------|
| Service | `backend/src/services/deepSeek.service.js` |
| Routes | `backend/src/routes/crawler.routes.js` |
| DB Table | `app_analytics.app_keyword_extractions` |

## Logic Flow
```
1. Check ClickHouse cache (by appId + country)
2. If cached → return immediately
3. If not → Fetch metadata from scraper
4. Call DeepSeek with ASO prompt
5. Save to ClickHouse
6. Return result
```

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/crawler/keywords/:appId?country=X` | Load cached |
| POST | `/api/crawler/extract-keywords` | Extract + save |

## Code Example

```javascript
// In any controller or cron job:
const deepSeekService = require('../services/deepSeek.service');

async function extractKeywords(appId, country, metadata, apiKey) {
    const result = await deepSeekService.extractExactKeywords(
        {
            title: metadata.title,
            shortDesc: metadata.shortDesc,
            fullDesc: metadata.fullDesc
        },
        apiKey,
        { id: 'credential-id', name: 'DeepSeek' }
    );
    
    // result.keywords = { brand_name, title_keywords, short_desc_keywords, description_keywords }
    // result.aiLog = { prompt, response }
    return result;
}
```

## Output Structure

```json
{
  "brand_name": "Tinder",
  "title_keywords": ["Dating", "Chat", "Meet"],
  "short_desc_keywords": ["local singles", "match"],
  "description_keywords": ["video chat", "verified profiles"],
  "language": "en",
  "country": "US"
}
```

## Prompt Rules (Anti-Fluff)
The prompt aggressively filters:
- ❌ Marketing: "millions of", "around the world", "vibe"
- ❌ Quantitative: numbers, "40+", "thousands"
- ❌ Emotional: "amazing", "incredible", "exciting"
- ✅ Keeps: Actions, Features, Categories, Personas
