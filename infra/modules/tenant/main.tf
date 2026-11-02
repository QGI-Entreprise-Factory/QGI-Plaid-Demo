variable "tenant_slug" {
  description = "Short lowercase identifier for the firm"
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}$", var.tenant_slug))
    error_message = "tenant_slug must be 2-31 chars: lowercase letters, digits, hyphens, starting with a letter."
  }
}

variable "deletion_protection" {
  description = "Protect the database and user pool from deletion. Set false only for throwaway demos."
  type        = bool
  default     = true
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Tenant data key. Besides the account root (so IAM policies govern access), CloudWatch Logs
# may use it so VPC flow logs and database logs can be encrypted with the same key.
data "aws_iam_policy_document" "kms" {
  statement {
    sid       = "AccountRootAdministers"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
  statement {
    sid       = "CloudWatchLogsEncrypt"
    actions   = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${data.aws_region.current.name}.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:*"]
    }
  }
}

resource "aws_kms_key" "data" {
  description             = "Tenant ${var.tenant_slug} data key (database, documents, Plaid tokens, secrets)"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms.json
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
  deletion_protection      = var.deletion_protection ? "ACTIVE" : "INACTIVE"

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
