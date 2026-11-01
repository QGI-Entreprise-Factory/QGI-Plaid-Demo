# Aurora PostgreSQL Serverless v2 (decision 0001). Encrypted with the tenant key, private network
# only, IAM database auth on, master password generated and rotated by Secrets Manager.

variable "engine_version" {
  type    = string
  default = "16.6"
}

variable "min_acu" {
  description = "Minimum Aurora capacity units. 0 lets the database pause when idle (cheapest for demos)."
  type        = number
  default     = 0.5
}

variable "max_acu" {
  type    = number
  default = 4
}

variable "backup_retention_days" {
  type    = number
  default = 14
}

variable "skip_final_snapshot" {
  description = "Skip the final snapshot on destroy. Keep false for real tenants."
  type        = bool
  default     = false
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.tenant_slug}-db"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_rds_cluster" "this" {
  cluster_identifier = "${var.tenant_slug}-db"
  engine             = "aurora-postgresql"
  engine_version     = var.engine_version
  database_name      = "app"
  master_username    = "qgi_admin"

  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.data.arn

  storage_encrypted                   = true
  kms_key_id                          = aws_kms_key.data.arn
  iam_database_authentication_enabled = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]

  backup_retention_period         = var.backup_retention_days
  copy_tags_to_snapshot           = true
  deletion_protection             = var.deletion_protection
  skip_final_snapshot             = var.skip_final_snapshot
  final_snapshot_identifier       = var.skip_final_snapshot ? null : "${var.tenant_slug}-final"
  enabled_cloudwatch_logs_exports = ["postgresql"]

  serverlessv2_scaling_configuration {
    min_capacity             = var.min_acu
    max_capacity             = var.max_acu
    seconds_until_auto_pause = var.min_acu == 0 ? 300 : null
  }
}

resource "aws_rds_cluster_instance" "writer" {
  identifier                            = "${var.tenant_slug}-db-1"
  cluster_identifier                    = aws_rds_cluster.this.id
  instance_class                        = "db.serverless"
  engine                                = aws_rds_cluster.this.engine
  engine_version                        = aws_rds_cluster.this.engine_version
  db_subnet_group_name                  = aws_db_subnet_group.this.name
  auto_minor_version_upgrade            = true
  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.data.arn
  performance_insights_retention_period = 7
}
