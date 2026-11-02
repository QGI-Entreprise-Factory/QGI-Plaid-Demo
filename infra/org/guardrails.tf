# Service Control Policies for every tenant account (OU: Tenants).
#
# SCPs only restrict; they never grant. What is denied here cannot be done in a
# tenant account by anyone, including that account's root user. Split into
# several policies because one SCP is limited to 5,120 characters and a target
# can have at most five SCPs attached.
#
# Pattern (AWS Organizations SCP best practices; AWS Financial Services lens):
#   1. region restriction            4. data-protection (KMS, S3 public access)
#   2. security-service protection   5. root-user restriction
#   3. IAM privilege-escalation + leave-organization
# Every deny exempts the break-glass role so a bad policy never locks us out.

variable "break_glass_role_name" {
  description = "Role in each tenant account allowed to bypass guardrails (emergency use, alarmed)."
  type        = string
  default     = "QGI-BreakGlass"
}

variable "platform_admin_role_name" {
  description = "Role the platform assumes into tenant accounts; allowed to administer IAM."
  type        = string
  default     = "QGI-PlatformAdmin"
}

locals {
  exempt_roles = [
    "arn:aws:iam::*:role/${var.break_glass_role_name}",
    "arn:aws:iam::*:role/${var.platform_admin_role_name}",
  ]
  break_glass_only = ["arn:aws:iam::*:role/${var.break_glass_role_name}"]

  # 1. Keep tenant data in approved regions. Global services are exempt.
  scp_regions = {
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyUnapprovedRegions"
      Effect    = "Deny"
      NotAction = ["a4b:*", "account:*", "budgets:*", "ce:*", "cloudfront:*", "cur:*", "globalaccelerator:*", "health:*", "iam:*", "organizations:*", "route53:*", "route53domains:*", "shield:*", "sts:*", "support:*", "trustedadvisor:*", "waf:*", "wafv2:*"]
      Resource  = "*"
      Condition = {
        StringNotEquals = { "aws:RequestedRegion" = var.allowed_regions }
        ArnNotLike      = { "aws:PrincipalARN" = local.break_glass_only }
      }
    }]
  }

  # 2. Nobody in a tenant account may blind the audit and detection tools.
  scp_security_services = {
    Version = "2012-10-17"
    Statement = [{
      Sid    = "ProtectSecurityServices"
      Effect = "Deny"
      Action = [
        "cloudtrail:StopLogging", "cloudtrail:DeleteTrail", "cloudtrail:UpdateTrail", "cloudtrail:PutEventSelectors",
        "config:StopConfigurationRecorder", "config:DeleteConfigurationRecorder", "config:DeleteDeliveryChannel", "config:PutConfigurationRecorder",
        "guardduty:DeleteDetector", "guardduty:UpdateDetector", "guardduty:DisassociateFromMasterAccount", "guardduty:DisassociateFromAdministratorAccount", "guardduty:DeleteMembers",
        "securityhub:DisableSecurityHub", "securityhub:DeleteMembers", "securityhub:DisassociateFromAdministratorAccount",
        "access-analyzer:DeleteAnalyzer",
      ]
      Resource  = "*"
      Condition = { ArnNotLike = { "aws:PrincipalARN" = local.break_glass_only } }
    }]
  }

  # 3. No privilege escalation outside approved roles, and tenants can never leave our control.
  scp_iam_and_org = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DenyLeaveOrganization"
        Effect   = "Deny"
        Action   = ["organizations:LeaveOrganization"]
        Resource = "*"
      },
      {
        Sid    = "DenyIamAdminUnlessApprovedRole"
        Effect = "Deny"
        Action = [
          "iam:CreateLoginProfile", "iam:UpdateLoginProfile",
          "iam:AttachUserPolicy", "iam:PutUserPolicy", "iam:AddUserToGroup",
          "iam:CreateRole", "iam:UpdateAssumeRolePolicy", "iam:AttachRolePolicy", "iam:PutRolePolicy",
          "iam:PutRolePermissionsBoundary", "iam:DeleteRolePermissionsBoundary", "iam:CreatePolicyVersion", "iam:SetDefaultPolicyVersion",
        ]
        Resource  = "*"
        Condition = { ArnNotLike = { "aws:PrincipalARN" = local.exempt_roles } }
      },
      {
        # Long-lived keys are how credentials leak; humans use SSO, workloads use roles.
        Sid       = "DenyIamUserAccessKeys"
        Effect    = "Deny"
        Action    = ["iam:CreateAccessKey", "iam:CreateUser"]
        Resource  = "*"
        Condition = { ArnNotLike = { "aws:PrincipalARN" = local.break_glass_only } }
      },
    ]
  }

  # 4. Tenant data protection: keys must not be destroyed; storage must not become public or unencrypted.
  scp_data_protection = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "ProtectKmsKeys"
        Effect    = "Deny"
        Action    = ["kms:ScheduleKeyDeletion", "kms:DisableKey", "kms:DisableKeyRotation", "kms:DeleteImportedKeyMaterial"]
        Resource  = "*"
        Condition = { ArnNotLike = { "aws:PrincipalARN" = local.break_glass_only } }
      },
      {
        # Account-wide public-access settings: break-glass only.
        Sid       = "ProtectAccountPublicAccessBlock"
        Effect    = "Deny"
        Action    = ["s3:PutAccountPublicAccessBlock"]
        Resource  = "*"
        Condition = { ArnNotLike = { "aws:PrincipalARN" = local.break_glass_only } }
      },
      {
        # Bucket-level settings: the platform role must be able to create/manage them (the tenant
        # module does), so it is exempt. Nobody else may weaken or remove them.
        Sid       = "ProtectBucketPublicAccessBlock"
        Effect    = "Deny"
        Action    = ["s3:PutBucketPublicAccessBlock", "s3:DeletePublicAccessBlock"]
        Resource  = "*"
        Condition = { ArnNotLike = { "aws:PrincipalARN" = local.exempt_roles } }
      },
      # Note: no "deny PutObject without encryption header" statement on purpose. It rejects normal
      # uploads even when the bucket encrypts by default (AWS guidance). Enforce encryption with
      # bucket default encryption (see infra/modules/tenant/documents.tf) instead.
      {
        Sid       = "DenyUnencryptedEbsVolumes"
        Effect    = "Deny"
        Action    = "ec2:CreateVolume"
        Resource  = "*"
        Condition = { Bool = { "ec2:Encrypted" = "false" } }
      },
      {
        Sid       = "DenyUnencryptedRds"
        Effect    = "Deny"
        Action    = ["rds:CreateDBInstance", "rds:CreateDBCluster"]
        Resource  = "*"
        Condition = { Bool = { "rds:StorageEncrypted" = "false" } }
      },
    ]
  }

  # 5. The root user of a tenant account does nothing day to day.
  scp_root_user = {
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyRootUser"
      Effect    = "Deny"
      Action    = "*"
      Resource  = "*"
      Condition = { StringLike = { "aws:PrincipalArn" = "arn:aws:iam::*:root" } }
    }]
  }

  tenant_scps = {
    "tenant-regions"           = local.scp_regions
    "tenant-security-services" = local.scp_security_services
    "tenant-iam-and-org"       = local.scp_iam_and_org
    "tenant-data-protection"   = local.scp_data_protection
    "tenant-root-user"         = local.scp_root_user
  }
}
