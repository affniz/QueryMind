import sqlparse
import sqlparse.tokens as T
from sqlparse.sql import Statement, Identifier, IdentifierList, Parenthesis
from sqlparse.tokens import Keyword, Name

_JOIN_KEYWORDS = frozenset({
    "FROM", "JOIN", "INNER JOIN", "LEFT JOIN", "RIGHT JOIN",
    "FULL JOIN", "CROSS JOIN", "LEFT OUTER JOIN", "RIGHT OUTER JOIN",
    "FULL OUTER JOIN",
})


class UnsafeSQLError(Exception):
    pass


def _extract_table_names(stmt: Statement) -> tuple[set[str], set[str]]:
    """Return (referenced_tables, subquery_aliases)."""
    tables: set[str] = set()
    aliases: set[str] = set()
    from_seen = False

    for token in stmt.tokens:
        if token.ttype is Keyword and token.normalized in _JOIN_KEYWORDS:
            from_seen = True
        elif token.ttype is Keyword:
            from_seen = False
        elif from_seen:
            if isinstance(token, Identifier):
                # If this identifier wraps a subquery, record its alias, not the token itself
                inner = next(
                    (t for t in token.tokens if isinstance(t, Parenthesis)), None
                )
                if inner is not None:
                    alias = token.get_alias() or token.get_real_name()
                    if alias:
                        aliases.add(alias.lower())
                    # Recurse into the subquery
                    for sub_stmt in sqlparse.parse(inner.value[1:-1]):
                        sub_tables, sub_aliases = _extract_table_names(sub_stmt)
                        tables.update(sub_tables)
                        aliases.update(sub_aliases)
                else:
                    name = token.get_real_name()
                    if name:
                        tables.add(name.lower())
            elif isinstance(token, IdentifierList):
                for ident in token.get_identifiers():
                    if isinstance(ident, Identifier):
                        inner = next(
                            (t for t in ident.tokens if isinstance(t, Parenthesis)), None
                        )
                        if inner is not None:
                            alias = ident.get_alias() or ident.get_real_name()
                            if alias:
                                aliases.add(alias.lower())
                            for sub_stmt in sqlparse.parse(inner.value[1:-1]):
                                sub_tables, sub_aliases = _extract_table_names(sub_stmt)
                                tables.update(sub_tables)
                                aliases.update(sub_aliases)
                        else:
                            name = ident.get_real_name()
                            if name:
                                tables.add(name.lower())
            elif token.ttype is Name:
                tables.add(token.value.lower())
        # Top-level parentheses (e.g. CTEs, subqueries not in FROM)
        if isinstance(token, Parenthesis):
            for sub_stmt in sqlparse.parse(token.value[1:-1]):
                sub_tables, sub_aliases = _extract_table_names(sub_stmt)
                tables.update(sub_tables)
                aliases.update(sub_aliases)
        if isinstance(token, Identifier):
            for sub_token in token.tokens:
                if isinstance(sub_token, Parenthesis):
                    for sub_stmt in sqlparse.parse(sub_token.value[1:-1]):
                        sub_tables, sub_aliases = _extract_table_names(sub_stmt)
                        tables.update(sub_tables)
                        aliases.update(sub_aliases)

    return tables, aliases


def validate_sql(sql: str, allowed_tables: set[str]) -> str:
    statements = sqlparse.parse(sql)

    if len(statements) != 1:
        raise UnsafeSQLError(
            f"Expected exactly one SQL statement, got {len(statements)}."
        )

    stmt = statements[0]
    stmt_type = stmt.get_type()
    is_cte = sql.strip().upper().startswith("WITH")

    if stmt_type != "SELECT" and not is_cte:
        raise UnsafeSQLError(
            f"Only SELECT statements are allowed, got: {stmt_type}"
        )

    # Extract CTE aliases from the AST — immune to comment/whitespace bypass
    cte_aliases: set[str] = set()
    is_cte_clause = False
    for token in stmt.tokens:
        if token.ttype is T.Keyword.CTE:
            is_cte_clause = True
            continue
        if is_cte_clause:
            if token.is_whitespace:
                continue
            if isinstance(token, IdentifierList):
                for ident in token.get_identifiers():
                    if isinstance(ident, Identifier):
                        name = ident.get_real_name()
                        if name:
                            cte_aliases.add(name.lower())
            elif isinstance(token, Identifier):
                name = token.get_real_name()
                if name:
                    cte_aliases.add(name.lower())
            is_cte_clause = False

    referenced_tables, subquery_aliases = _extract_table_names(stmt)
    excluded = {t.lower() for t in allowed_tables} | cte_aliases | subquery_aliases
    disallowed = referenced_tables - excluded
    if disallowed:
        raise UnsafeSQLError(
            f"Query references unauthorized tables: {disallowed}"
        )

    return str(stmt).strip()
