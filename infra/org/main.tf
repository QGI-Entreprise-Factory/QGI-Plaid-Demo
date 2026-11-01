terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

variable "allowed_regions" {
  description = "Regions tenant accounts may use. Everything else is denied by SCP."
  type        = list(string)
  default     = ["us-east-1", "ca-central-1"]
}

data "aws_organizations_organization" "this" {}

locals {
  root_id = data.aws_organizations_organization.this.roots[0].id
}

resource "aws_organizations_organizational_unit" "platform" {
  name      = "Platform"
  parent_id = local.root_id
}

resource "aws_organizations_organizational_unit" "tenants" {
  name      = "Tenants"
  parent_id = local.root_id
}

resource "aws_organizations_policy" "tenant" {
  for_each    = local.tenant_scps
  name        = each.key
  description = "Tenant guardrail: ${each.key}"
  type        = "SERVICE_CONTROL_POLICY"
  content     = jsonencode(each.value)
}

# Attached to the Tenants OU only, never the organization root (AWS guidance:
# test on a small OU first). Five SCPs per target is the AWS maximum.
resource "aws_organizations_policy_attachment" "tenants" {
  for_each  = aws_organizations_policy.tenant
  policy_id = each.value.id
  target_id = aws_organizations_organizational_unit.tenants.id
}
