variable "tenant_slug" {
  description = "Short lowercase identifier for the firm"
  type        = string
}

resource "aws_kms_key" "data" {
  description             = "Tenant ${var.tenant_slug} data key (database, Plaid tokens, secrets)"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

resource "aws_kms_alias" "data" {
  name          = "alias/${var.tenant_slug}-data"
  target_key_id = aws_kms_key.data.key_id
}

# Shell only: the secret value (Plaid client_id/secret) is set out of band, never in code or state.
resource "aws_secretsmanager_secret" "plaid" {
  name       = "${var.tenant_slug}/plaid"
  kms_key_id = aws_kms_key.data.arn
}

resource "aws_cognito_user_pool" "clients" {
  name                     = "${var.tenant_slug}-clients"
  mfa_configuration        = "ON"
  auto_verified_attributes = ["email"]

  software_token_mfa_configuration {
    enabled = true
  }

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }
}

resource "aws_cognito_user_group" "business" {
  name         = "business-clients"
  user_pool_id = aws_cognito_user_pool.clients.id
}

resource "aws_cognito_user_group" "consumer" {
  name         = "consumer-clients"
  user_pool_id = aws_cognito_user_pool.clients.id
}
