# Private-only network for the tenant database: no internet gateway, no NAT, no public subnets.
# Application workloads reach it through the "app" security group.

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${var.tenant_slug}-vpc" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone = local.azs[count.index]
  tags              = { Name = "${var.tenant_slug}-private-${local.azs[count.index]}" }
}

# Lock down the default security group so nothing can use it by accident.
resource "aws_default_security_group" "default" {
  vpc_id = aws_vpc.this.id
}

resource "aws_security_group" "app" {
  name        = "${var.tenant_slug}-app"
  description = "Application workloads allowed to reach the tenant database"
  vpc_id      = aws_vpc.this.id
}

resource "aws_security_group" "db" {
  name        = "${var.tenant_slug}-db"
  description = "Tenant database: PostgreSQL from the app security group only"
  vpc_id      = aws_vpc.this.id
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_egress_rule" "app_to_db" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_cloudwatch_log_group" "flow" {
  name              = "/qgi/${var.tenant_slug}/vpc-flow"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.data.arn
}

data "aws_iam_policy_document" "flow_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "flow_write" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = ["${aws_cloudwatch_log_group.flow.arn}:*"]
  }
}

resource "aws_iam_role" "flow" {
  name               = "${var.tenant_slug}-vpc-flow"
  path               = "/qgi/"
  assume_role_policy = data.aws_iam_policy_document.flow_assume.json
}

resource "aws_iam_role_policy" "flow" {
  role   = aws_iam_role.flow.id
  policy = data.aws_iam_policy_document.flow_write.json
}

resource "aws_flow_log" "this" {
  vpc_id               = aws_vpc.this.id
  traffic_type         = "ALL"
  log_destination_type = "cloud-watch-logs"
  log_destination      = aws_cloudwatch_log_group.flow.arn
  iam_role_arn         = aws_iam_role.flow.arn
}
