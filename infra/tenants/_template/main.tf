# Tenant stack template (valid dummy values so CI can validate it). Do not edit this copy:
# `scripts/new-tenant.sh` copies it to infra/tenants/<slug>/ with real values. One state per tenant.

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # Configure a remote backend (S3 + lock) in the PLATFORM account before the first real apply.
}

locals {
  tenant_slug = "qgi-template"
  account_id  = "111111111111"
  region      = "us-east-1"

  # Platform principals allowed to assume the roles in the tenant account (set per environment).
  trusted_principal_arns = ["arn:aws:iam::222222222222:root"]
  organization_id        = "o-aaaaaaaaaa"
  alarm_email            = ""
}

provider "aws" {
  region = local.region
  assume_role {
    role_arn = "arn:aws:iam::${local.account_id}:role/OrganizationAccountAccessRole"
  }
  default_tags {
    tags = { Tenant = local.tenant_slug, ManagedBy = "opentofu", Platform = "qgi" }
  }
}

module "baseline" {
  source                 = "../../modules/account-baseline"
  trusted_principal_arns = local.trusted_principal_arns
  organization_id        = local.organization_id
  alarm_email            = local.alarm_email
}

module "tenant" {
  source      = "../../modules/tenant"
  tenant_slug = local.tenant_slug

  # Real tenants keep the defaults (deletion protection on, final snapshot kept).
  # A demo may set: deletion_protection = false, skip_final_snapshot = true, min_acu = 0
}

output "mcp_env" {
  description = "Values for the MCP server (.env)"
  value = {
    COGNITO_ISSUER    = module.tenant.cognito_issuer
    COGNITO_CLIENT_ID = module.tenant.mcp_client_id
    DOCUMENTS_BUCKET  = module.tenant.documents_bucket
  }
}

output "break_glass_role_arn" {
  value = module.baseline.break_glass_role_arn
}

output "platform_admin_role_arn" {
  value = module.baseline.platform_admin_role_arn
}
