output "kms_key_arn" {
  value = aws_kms_key.data.arn
}

output "plaid_secret_arn" {
  value = aws_secretsmanager_secret.plaid.arn
}

output "db_endpoint" {
  value = aws_rds_cluster.this.endpoint
}

output "db_master_secret_arn" {
  description = "Secrets Manager secret holding the generated database master credentials"
  value       = aws_rds_cluster.this.master_user_secret[0].secret_arn
}

output "app_security_group_id" {
  description = "Attach to application workloads that must reach the database"
  value       = aws_security_group.app.id
}

output "documents_bucket" {
  value = aws_s3_bucket.documents.bucket
}

# Values for the MCP server (COGNITO_ISSUER / COGNITO_CLIENT_ID).
output "cognito_issuer" {
  value = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.clients.id}"
}

output "mcp_client_id" {
  value = aws_cognito_user_pool_client.mcp.id
}

output "cognito_domain" {
  value = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
}
