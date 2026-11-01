# Per-account baseline: the two roles referenced by the tenant SCPs (infra/org/guardrails.tf),
# plus an alarm whenever the break-glass role is used. No IAM users, no long-lived keys.
#
#   QGI-PlatformAdmin  daily operations by the QGI platform (power user + IAM limited to /qgi/)
#   QGI-BreakGlass     emergency administrator; MFA required, 1h sessions, every use alarmed

variable "trusted_principal_arns" {
  description = "Platform-account principals (roles) allowed to assume the two roles"
  type        = list(string)
  validation {
    condition     = length(var.trusted_principal_arns) > 0 && alltrue([for a in var.trusted_principal_arns : can(regex("^arn:aws:iam::[0-9]{12}:", a))])
    error_message = "Provide at least one IAM principal ARN, e.g. arn:aws:iam::123456789012:role/Operators."
  }
}

variable "organization_id" {
  description = "AWS Organization id (o-xxxx). Only principals inside it may assume the roles."
  type        = string
}

variable "alarm_email" {
  description = "Email notified whenever QGI-BreakGlass is assumed. Empty creates the topic without a subscriber."
  type        = string
  default     = ""
}

variable "platform_admin_role_name" {
  type    = string
  default = "QGI-PlatformAdmin"
}

variable "break_glass_role_name" {
  type    = string
  default = "QGI-BreakGlass"
}

data "aws_caller_identity" "current" {}

locals {
  platform_admin_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.platform_admin_role_name}"
  break_glass_arn    = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.break_glass_role_name}"
}

# --- QGI-PlatformAdmin ---------------------------------------------------------------------

data "aws_iam_policy_document" "platform_trust" {
  statement {
    actions = ["sts:AssumeRole", "sts:TagSession"]
    principals {
      type        = "AWS"
      identifiers = var.trusted_principal_arns
    }
    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalOrgID"
      values   = [var.organization_id]
    }
  }
}

resource "aws_iam_role" "platform_admin" {
  name                 = var.platform_admin_role_name
  assume_role_policy   = data.aws_iam_policy_document.platform_trust.json
  max_session_duration = 14400
}

resource "aws_iam_role_policy_attachment" "platform_power_user" {
  role       = aws_iam_role.platform_admin.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

# PowerUserAccess has no IAM. Allow role/policy management only under the /qgi/ path, and never
# on the two privileged roles themselves.
data "aws_iam_policy_document" "platform_iam" {
  statement {
    sid = "ManageQgiRolesAndPolicies"
    actions = [
      "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole", "iam:UpdateAssumeRolePolicy",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy",
      "iam:TagRole", "iam:UntagRole", "iam:PassRole",
      "iam:CreatePolicy", "iam:DeletePolicy", "iam:CreatePolicyVersion", "iam:DeletePolicyVersion",
      "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile", "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile",
    ]
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/qgi/*",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/qgi/*",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:instance-profile/qgi/*",
    ]
  }
  statement {
    sid       = "ReadIam"
    actions   = ["iam:Get*", "iam:List*", "iam:SimulatePrincipalPolicy", "iam:CreateServiceLinkedRole"]
    resources = ["*"]
  }
  statement {
    sid       = "NeverTouchPrivilegedRoles"
    effect    = "Deny"
    actions   = ["iam:*"]
    resources = [local.platform_admin_arn, local.break_glass_arn]
  }
}

resource "aws_iam_role_policy" "platform_iam" {
  name   = "qgi-iam-limited"
  role   = aws_iam_role.platform_admin.id
  policy = data.aws_iam_policy_document.platform_iam.json
}

# --- QGI-BreakGlass ------------------------------------------------------------------------

data "aws_iam_policy_document" "break_glass_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "AWS"
      identifiers = var.trusted_principal_arns
    }
    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalOrgID"
      values   = [var.organization_id]
    }
    condition {
      test     = "Bool"
      variable = "aws:MultiFactorAuthPresent"
      values   = ["true"]
    }
  }
}

resource "aws_iam_role" "break_glass" {
  name                 = var.break_glass_role_name
  assume_role_policy   = data.aws_iam_policy_document.break_glass_trust.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "break_glass_admin" {
  role       = aws_iam_role.break_glass.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# --- Alarm on any break-glass use ------------------------------------------------------------

# EventBridge cannot publish to a topic encrypted with the AWS-managed SNS key, so use our own key.
data "aws_iam_policy_document" "alarm_key" {
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
    sid       = "EventBridgeAndSnsUseKey"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com", "sns.amazonaws.com"]
    }
  }
}

resource "aws_kms_key" "alarm" {
  description             = "Encrypts the break-glass alarm topic"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.alarm_key.json
}

resource "aws_sns_topic" "break_glass" {
  name              = "qgi-break-glass-used"
  kms_master_key_id = aws_kms_key.alarm.arn
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.break_glass.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_event_rule" "break_glass_used" {
  name        = "qgi-break-glass-assumed"
  description = "Fires when the break-glass role is assumed"
  event_pattern = jsonencode({
    source        = ["aws.sts"]
    "detail-type" = ["AWS API Call via CloudTrail"]
    detail = {
      eventSource       = ["sts.amazonaws.com"]
      eventName         = ["AssumeRole"]
      requestParameters = { roleArn = [local.break_glass_arn] }
    }
  })
}

resource "aws_cloudwatch_event_target" "break_glass_sns" {
  rule = aws_cloudwatch_event_rule.break_glass_used.name
  arn  = aws_sns_topic.break_glass.arn
}

data "aws_iam_policy_document" "sns_from_events" {
  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.break_glass.arn]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_sns_topic_policy" "break_glass" {
  arn    = aws_sns_topic.break_glass.arn
  policy = data.aws_iam_policy_document.sns_from_events.json
}

output "platform_admin_role_arn" {
  value = aws_iam_role.platform_admin.arn
}

output "break_glass_role_arn" {
  value = aws_iam_role.break_glass.arn
}
