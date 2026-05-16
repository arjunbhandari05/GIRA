"""PubMed lookup via NCBI E-utilities."""

import os
from urllib.parse import urlencode

import aiohttp

BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"


def _params(extra: dict) -> dict:
    return {
        "email": os.getenv("NCBI_EMAIL", "glycoagent@example.com"),
        "tool": "glycoagent",
        **extra,
    }


async def get_pubmed(query: str, session: aiohttp.ClientSession) -> list:
    try:
        search_url = BASE_URL + "esearch.fcgi?" + urlencode(
            _params(
                {
                    "db": "pubmed",
                    "term": query,
                    "retmax": 3,
                    "retmode": "json",
                }
            )
        )
        async with session.get(search_url) as resp:
            if resp.status != 200:
                return []
            search_payload = await resp.json()

        pmids = (search_payload.get("esearchresult") or {}).get("idlist") or []
        if not pmids:
            return []

        fetch_url = BASE_URL + "efetch.fcgi?" + urlencode(
            _params(
                {
                    "db": "pubmed",
                    "id": ",".join(pmids),
                    "rettype": "abstract",
                    "retmode": "json",
                }
            )
        )
        async with session.get(fetch_url) as resp:
            if resp.status == 200:
                try:
                    fetch_payload = await resp.json(content_type=None)
                    articles = _articles_from_efetch_json(pmids, fetch_payload)
                    if articles:
                        return articles
                except Exception:
                    pass

        summary_url = BASE_URL + "esummary.fcgi?" + urlencode(
            _params(
                {
                    "db": "pubmed",
                    "id": ",".join(pmids),
                    "retmode": "json",
                }
            )
        )
        async with session.get(summary_url) as resp:
            if resp.status != 200:
                return [{"pmid": pmid, "title": "", "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"} for pmid in pmids]
            summary_payload = await resp.json()

        return _articles_from_summary(pmids, summary_payload)
    except Exception:
        return []


def _articles_from_efetch_json(pmids: list[str], payload: dict) -> list:
    articles = []
    result = payload.get("result") if isinstance(payload, dict) else {}
    if not isinstance(result, dict):
        return articles

    for pmid in pmids[:3]:
        article = result.get(pmid) or {}
        title = str(article.get("title") or article.get("sorttitle") or "").strip()
        if title:
            articles.append(
                {
                    "pmid": pmid,
                    "title": title,
                    "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                }
            )
    return articles


def _articles_from_summary(pmids: list[str], payload: dict) -> list:
    results = payload.get("result") or {}
    articles = []
    for pmid in pmids[:3]:
        article = results.get(pmid) or {}
        title = str(article.get("title", "")).strip()
        articles.append(
            {
                "pmid": pmid,
                "title": title,
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            }
        )
    return articles
