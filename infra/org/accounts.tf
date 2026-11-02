# Account factory: one AWS account per tenant, created inside the Tenants OU so the tenant
# guardrails apply from the first minute. Empty by default: nothing is created until you add a tenant.
#
# Each account needs a UNIQUE email address (plus-addressing such as ops+acme@example.com works).
# Closing an account later is a manual, 90-day process, so close_on_deletion stays false.

variable "tenants" {
  description = "Tenant AWS accounts to create, keyed by tenant slug"
  type = map(object({
    email = string
  }))
  default = {}
}

resource "aws_organizations_account" "tenant" {
  for_each                   = var.tenants
  name                       = "tenant-${each.key}"
  email                      = each.value.email
  parent_id                  = aws_organizations_organizational_unit.tenants.id
  role_name                  = "OrganizationAccountAccessRole"
  iam_user_access_to_billing = "DENY"
  close_on_deletion          = false

  lifecycle {
    # These can only be set at creation; changing them later would force account replacement.
    ignore_changes = [role_name, iam_user_access_to_billing]
  }
}

output "tenant_account_ids" {
  value = { for slug, a in aws_organizations_account.tenant : slug => a.id }
}

output "organization_id" {
  value = data.aws_organizations_organization.this.id
}

output "tenants_ou_id" {
  value = aws_organizations_organizational_unit.tenants.id
}
