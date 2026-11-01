# OAuth for the app MCP server (decision: OAuth through the tenant's Cognito). AI clients use the
# authorization-code flow with PKCE as public clients (no client secret) and get a read-only scope.

variable "mcp_callback_urls" {
  description = "OAuth redirect URIs of the AI clients allowed to sign in. Review before adding any."
  type        = list(string)
  default = [
    "http://localhost:6274/oauth/callback",
    "https://claude.ai/api/mcp/auth_callback",
    "https://chatgpt.com/connector_platform_oauth_redirect",
  ]
}

resource "aws_cognito_user_pool_domain" "this" {
  domain       = "${var.tenant_slug}-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.clients.id
}

resource "aws_cognito_resource_server" "mcp" {
  identifier   = "qgi-mcp"
  name         = "QGI app MCP server"
  user_pool_id = aws_cognito_user_pool.clients.id

  scope {
    scope_name        = "tools.read"
    scope_description = "Call read-only MCP tools"
  }
}

resource "aws_cognito_user_pool_client" "mcp" {
  name         = "${var.tenant_slug}-mcp"
  user_pool_id = aws_cognito_user_pool.clients.id

  generate_secret                      = false
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "${aws_cognito_resource_server.mcp.identifier}/tools.read"]
  callback_urls                        = var.mcp_callback_urls
  supported_identity_providers         = ["COGNITO"]
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors        = "ENABLED"

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 12

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "hours"
  }
}
