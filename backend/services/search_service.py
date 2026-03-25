from duckduckgo_search import DDGS


def web_search(query: str, max_results: int = 5) -> str:
    """Returns formatted search results as a string."""
    with DDGS() as ddgs:
        results = list(ddgs.text(query, max_results=max_results))
    if not results:
        return "No results found."
    lines = []
    for i, r in enumerate(results, 1):
        lines.append(f"{i}. {r['title']}\n   {r['href']}\n   {r['body']}\n")
    return "\n".join(lines)
