"""PubMed lookup via NCBI E-utilities."""

import os
import ssl
import time
from typing import Any
from urllib.parse import urlencode

import aiohttp
import certifi
import requests

from apis.ncbi_util import ncbi_params


def _ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=certifi.where())

BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"


async def get_pubmed(query: str, session: aiohttp.ClientSession) -> list:
    ssl_kwargs = {"ssl": _ssl_context()}
    try:
        search_url = BASE_URL + "esearch.fcgi?" + urlencode(
            ncbi_params(
                {
                    "db": "pubmed",
                    "term": query,
                    "retmax": 3,
                    "retmode": "json",
                }
            )
        )
        async with session.get(search_url, **ssl_kwargs) as resp:
            if resp.status != 200:
                return []
            search_payload = await resp.json()

        pmids = (search_payload.get("esearchresult") or {}).get("idlist") or []
        if not pmids:
            return []

        fetch_url = BASE_URL + "efetch.fcgi?" + urlencode(
            ncbi_params(
                {
                    "db": "pubmed",
                    "id": ",".join(pmids),
                    "rettype": "abstract",
                    "retmode": "json",
                }
            )
        )
        async with session.get(fetch_url, **ssl_kwargs) as resp:
            if resp.status == 200:
                try:
                    fetch_payload = await resp.json(content_type=None)
                    articles = _articles_from_efetch_json(pmids, fetch_payload)
                    if articles:
                        return articles
                except Exception:
                    pass

        summary_url = BASE_URL + "esummary.fcgi?" + urlencode(
            ncbi_params(
                {
                    "db": "pubmed",
                    "id": ",".join(pmids),
                    "retmode": "json",
                }
            )
        )
        async with session.get(summary_url, **ssl_kwargs) as resp:
            if resp.status != 200:
                return [{"pmid": pmid, "title": "", "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"} for pmid in pmids]
            summary_payload = await resp.json()

        return _articles_from_summary(pmids, summary_payload)
    except Exception:
        return []


def _evidence_note(gene: str, drug: str, title: str) -> str:
    t = (title or "").strip()
    if len(t) > 220:
        t = t[:217] + "…"
    return (
        f"PubMed retrieval for {gene.upper()} + “{drug}”: this paper was returned "
        f"by NCBI for that query — {t or 'title unavailable from summary.'}"
    )


def _pubmed_search_http(term: str, retmax: int = 4) -> tuple[list[str], dict[str, Any]]:
    meta: dict[str, Any] = {"source": "pubmed", "status": "ok", "detail": None, "query": term}
    search_url = BASE_URL + "esearch.fcgi?" + urlencode(
        ncbi_params(
            {
                "db": "pubmed",
                "term": term,
                "retmax": str(retmax),
                "retmode": "json",
            }
        )
    )
    try:
        r = requests.get(search_url, timeout=35, verify=certifi.where())
        r.raise_for_status()
        search_payload = r.json()
    except Exception as exc:  # noqa: BLE001
        meta["status"] = "error"
        meta["detail"] = str(exc)[:500]
        return [], meta

    pmids = (search_payload.get("esearchresult") or {}).get("idlist") or []
    if not pmids:
        meta["status"] = "empty"
        meta["detail"] = "NCBI esearch returned zero PMIDs for this query."
        return [], meta
    return pmids, meta


def _pubmed_summaries_http(pmids: list[str]) -> dict[str, dict]:
    """pmid -> {pmid, title, url} using esummary (sync)."""
    if not pmids:
        return {}
    summary_url = BASE_URL + "esummary.fcgi?" + urlencode(
        ncbi_params({"db": "pubmed", "id": ",".join(pmids), "retmode": "json"})
    )
    try:
        r = requests.get(summary_url, timeout=35, verify=certifi.where())
        r.raise_for_status()
        summary_payload = r.json()
    except Exception:
        return {
            p: {"pmid": p, "title": "", "url": f"https://pubmed.ncbi.nlm.nih.gov/{p}/"}
            for p in pmids
        }

    results = summary_payload.get("result") or {}
    out: dict[str, dict] = {}
    for pmid in pmids:
        article = results.get(pmid) or {}
        title = str(article.get("title", "")).strip()
        out[pmid] = {
            "pmid": pmid,
            "title": title,
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        }
    return out


def fetch_pubmed_articles_for_pmids(pmids: list[str]) -> dict[str, Any]:
    """
    Resolve titles for specific PMIDs (used when assembling citations that
    reference PMIDs not returned by the prior gene+drug searches).
    """
    meta: dict[str, Any] = {"source": "pubmed", "status": "ok", "detail": None}
    clean = [str(p).strip() for p in pmids if p and str(p).strip()]
    if not clean:
        return {"articles": [], "_meta": {**meta, "status": "empty", "detail": "No PMIDs"}}
    time.sleep(0.11)
    by_id = _pubmed_summaries_http(clean[:20])
    articles = []
    for pmid in clean[:20]:
        row = by_id.get(pmid) or {
            "pmid": pmid,
            "title": "",
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        }
        articles.append(
            {
                **row,
                "evidence_note": (
                    f"PubMed record PMID {pmid}: title pulled live from NCBI esummary "
                    f"for citation packaging in the brief."
                ),
            }
        )
    return {"articles": articles, "_meta": meta}


def fetch_pubmed(gene: str | None = None, drug: str | None = None, **_kwargs: Any) -> dict[str, Any]:
    """
    Agent tool entrypoint — live NCBI esearch + esummary (no static PMID table).

    Returns ``{"articles": [...], "_meta": {...}}``; each article includes
    ``evidence_note`` describing why the row is relevant to the gene+drug query.
    """
    meta: dict[str, Any] = {"source": "pubmed", "status": "ok", "detail": None}
    if not gene or not drug:
        return {
            "articles": [],
            "_meta": {**meta, "status": "error", "detail": "Both gene and drug are required."},
        }

    g = str(gene).strip()
    d = str(drug).strip()
    term = f"({g}[Title/Abstract]) AND ({d}[Title/Abstract])"
    pmids, search_meta = _pubmed_search_http(term, retmax=4)
    meta["query"] = term
    if search_meta.get("status") != "ok":
        meta.update(search_meta)
        return {"articles": [], "_meta": meta}

    time.sleep(0.11)
    by_id = _pubmed_summaries_http(pmids)
    articles: list[dict[str, Any]] = []
    for pmid in pmids:
        row = by_id.get(pmid) or {
            "pmid": pmid,
            "title": "",
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        }
        articles.append(
            {
                **row,
                "gene": g,
                "drug": d,
                "evidence_note": _evidence_note(g, d, row.get("title") or ""),
            }
        )

    if not articles:
        meta["status"] = "empty"
        meta["detail"] = "No PubMed articles for this gene+drug query."
    return {"articles": articles, "_meta": meta}


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
