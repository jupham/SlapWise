import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface DynamoStackProps extends cdk.StackProps {
  stage: string;
}

export class DynamoStack extends cdk.Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DynamoStackProps) {
    super(scope, id, props);
    const { stage } = props;

    this.table = new dynamodb.Table(this, 'SlapTrackerTable', {
      tableName: `${stage}-SlapTracker`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'TTL',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    // GSI1: Player's groups — PLAYER#<playerId> → GROUP#<groupId>
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: Debts by status — GROUP#<groupId>#STATUS#<status> → DEBT#<debtId>
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI4: All debts for a player in a group — PLAYER#<playerId>#GROUP#<groupId> → DEBT#<debtId>
    // Written as separate player-debt index items for each involved player (fan-out write pattern)
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI4',
      partitionKey: { name: 'GSI4PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI4SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      exportName: `${stage}-SlapTrackerTableName`,
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      exportName: `${stage}-SlapTrackerTableArn`,
    });
  }
}
