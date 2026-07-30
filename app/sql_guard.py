import re
import sqlparse
from sqlparse.sql import Statement, Identifier, IdentifierList, Parenthesis
from sqlparse.tokens import Keyword, Name

_JOIN_KEYWORDS = frozenset({
    "FROM", "JOIN", "INNER JOIN", "LEFT JOIN", "RIGHT JOIN",
    "FULL JOIN", "CROSS JOIN", "LEFT OUTER JOIN", "RIGHT OUTER JOIN",
    "FULL OUTER JOIN",
})


class UnsafeSQLError(Exception):
    pass


def _extract_table_names(stmt: Statement) -> set[str]:
    tables: set[str] = set()
    from_seen = False

    for token in stmt.tokens:
        if token.ttype is Keyword and token.normalized in _JOIN_KEYWORDS:
            from_seen = True
        elif token.ttype is Keyword:
            from_seen = False
        elif from_seen:
            if isinstance(token, Identifier):
                name = token.get_real_name()
                if name:
                    tables.add(name.lower())
            elif isinstance(token, IdentifierList):
                for ident in token.get_identifiers():
                    if isinstance(ident, Identifier):
                        name = ident.get_real_name()
                        if name:
                            tables.add(name.lower())
            elif token.ttype is Name:
                tables.add(token.value.lower())
        if isinstance(token, Parenthesis):
            for sub_stmt in sqlparse.parse(token.value[1:-1]):
                tables.update(_extract_table_names(sub_stmt))
        if isinstance(token, Identifier):
            for sub_token in token.tokens:
                if isinstance(sub_token, Parenthesis):
                    for sub_stmt in sqlparse.parse(sub_token.value[1:-1]):
                        tables.update(_extract_table_names(sub_stmt))

    return tables


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

    cte_aliases = {m.group(1).lower() for m in re.finditer(r'(\w+)\s+AS\s*\(', sql, re.IGNORECASE)}

    referenced_tables = _extract_table_names(stmt)
    disallowed = referenced_tables - {t.lower() for t in allowed_tables} - cte_aliases
    if disallowed:
        raise UnsafeSQLError(
            f"Query references unauthorized tables: {disallowed}"
        )

    return str(stmt).strip()
