from app.api.v1.endpoints import websocket as ws_endpoint


ACCESS_CREDENTIAL = "opaque-access-credential"


def test_websocket_credential_is_read_from_bearer_subprotocol_pair():
    credential = ws_endpoint._websocket_credential_from_subprotocols(
        f"bearer, {ACCESS_CREDENTIAL}"
    )

    assert credential == ACCESS_CREDENTIAL


def test_websocket_credential_parser_is_case_and_whitespace_tolerant():
    credential = ws_endpoint._websocket_credential_from_subprotocols(
        f" Bearer , {ACCESS_CREDENTIAL} , other "
    )

    assert credential == ACCESS_CREDENTIAL


def test_websocket_accepts_only_bearer_subprotocol_not_the_credential():
    selected = ws_endpoint._select_auth_subprotocol(f"bearer, {ACCESS_CREDENTIAL}")

    assert selected == "bearer"


def test_websocket_query_fallback_does_not_select_a_subprotocol():
    selected = ws_endpoint._select_auth_subprotocol(None)

    assert selected is None


def test_websocket_subprotocol_credential_does_not_need_query_param():
    credential, selected = ws_endpoint._resolve_websocket_credential(
        f"bearer, {ACCESS_CREDENTIAL}",
        None,
    )

    assert credential == ACCESS_CREDENTIAL
    assert selected == "bearer"
