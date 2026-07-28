from app.table_manager import sanitize_column_name

def test_sanitize_name_lowercase():
    assert sanitize_column_name("HELLO") == "hello"

def test_sanitize_name_replace_spaces_hyphens():
    assert sanitize_column_name("hello world-test") == "hello_world_test"

def test_sanitize_name_strip_non_alphanumeric():
    assert sanitize_column_name("hello@world#123!") == "helloworld123"

def test_sanitize_name_prefix_digit():
    assert sanitize_column_name("1st_dataset") == "_1st_dataset"
    assert sanitize_column_name("99-problems") == "_99_problems"

def test_sanitize_name_combined():
    assert sanitize_column_name("1st-Dataset Name @2026!") == "_1st_dataset_name_2026"
