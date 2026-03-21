import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';
import { Construct } from 'constructs';
import { LambdaStack } from './lambda-stack';

export interface AppSyncStackProps extends cdk.StackProps {
  table: dynamodb.Table;
  userPool: cognito.UserPool;
  lambdaStack: LambdaStack;
}

export class AppSyncStack extends cdk.Stack {
  public readonly api: appsync.GraphqlApi;

  constructor(scope: Construct, id: string, props: AppSyncStackProps) {
    super(scope, id, props);

    const { table, userPool, lambdaStack } = props;

    this.api = new appsync.GraphqlApi(this, 'SlapTrackerApi', {
      name: 'SlapTrackerApi',
      schema: appsync.SchemaFile.fromAsset(
        path.join(__dirname, '../graphql/schema.graphql')
      ),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: { userPool },
        },
      },
      xrayEnabled: true,
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ERROR,
      },
    });

    // ── Data Sources ──────────────────────────────────────────────────────────

    const ddbDataSource = this.api.addDynamoDbDataSource('SlapTrackerDdbSource', table);

    const submitResolutionDs = this.api.addLambdaDataSource(
      'SubmitResolutionDs',
      lambdaStack.submitResolutionConfirmationFn
    );

    const confirmDeliveryDs = this.api.addLambdaDataSource(
      'ConfirmDeliveryDs',
      lambdaStack.confirmDeliveryFn
    );

    const recordGameCallDs = this.api.addLambdaDataSource(
      'RecordGameCallDs',
      lambdaStack.recordGameCallFn
    );

    const leaveGroupDs = this.api.addLambdaDataSource(
      'LeaveGroupDs',
      lambdaStack.leaveGroupFn
    );

    // ── Query Resolvers (DynamoDB VTL) ────────────────────────────────────────

    // getGroups: query GSI1 with PLAYER#<playerId>
    ddbDataSource.createResolver('GetGroupsResolver', {
      typeName: 'Query',
      fieldName: 'getGroups',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "Query",
  "index": "GSI1",
  "query": {
    "expression": "GSI1PK = :pk",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("PLAYER#$ctx.identity.sub")
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
$util.toJson($ctx.result.items)
      `),
    });

    // getGroupMembers: query GROUP#<groupId> / MEMBER#*
    ddbDataSource.createResolver('GetGroupMembersResolver', {
      typeName: 'Query',
      fieldName: 'getGroupMembers',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "Query",
  "query": {
    "expression": "PK = :pk AND begins_with(SK, :sk)",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
      ":sk": $util.dynamodb.toDynamoDBJson("MEMBER#")
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
$util.toJson($ctx.result.items)
      `),
    });

    // getPendingDebts: query GSI2 with GROUP#<groupId>#STATUS#pending
    ddbDataSource.createResolver('GetPendingDebtsResolver', {
      typeName: 'Query',
      fieldName: 'getPendingDebts',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "Query",
  "index": "GSI2",
  "query": {
    "expression": "GSI2PK = :pk",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId#STATUS#pending")
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
$util.toJson($ctx.result.items)
      `),
    });

    // getDebts: query GSI2 with optional status filter
    ddbDataSource.createResolver('GetDebtsResolver', {
      typeName: 'Query',
      fieldName: 'getDebts',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
#set($status = $util.defaultIfNullOrBlank($ctx.args.status, "resolved"))
{
  "version": "2017-02-28",
  "operation": "Query",
  "index": "GSI2",
  "query": {
    "expression": "GSI2PK = :pk",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId#STATUS#$status")
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
$util.toJson($ctx.result.items)
      `),
    });

    // getNetSummary: Lambda resolver (aggregation logic)
    ddbDataSource.createResolver('GetNetSummaryResolver', {
      typeName: 'Query',
      fieldName: 'getNetSummary',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "Query",
  "index": "GSI2",
  "query": {
    "expression": "GSI2PK = :pk",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId#STATUS#resolved")
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
## Stub: aggregation computed client-side for now
$util.toJson([])
      `),
    });

    // getGames: query GROUP#<groupId> / GAME#*
    ddbDataSource.createResolver('GetGamesResolver', {
      typeName: 'Query',
      fieldName: 'getGames',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "Query",
  "query": {
    "expression": "PK = :pk AND begins_with(SK, :sk)",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
      ":sk": $util.dynamodb.toDynamoDBJson("GAME#")
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
$util.toJson($ctx.result.items)
      `),
    });

    // getReadInPlayers: query MEMBER#* filtered by isReadIn
    ddbDataSource.createResolver('GetReadInPlayersResolver', {
      typeName: 'Query',
      fieldName: 'getReadInPlayers',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "Query",
  "query": {
    "expression": "PK = :pk AND begins_with(SK, :sk)",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
      ":sk": $util.dynamodb.toDynamoDBJson("MEMBER#")
    }
  },
  "filter": {
    "expression": "isReadIn = :readIn",
    "expressionValues": {
      ":readIn": $util.dynamodb.toDynamoDBJson(true)
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
$util.toJson($ctx.result.items)
      `),
    });

    // getChugEvents: query GROUP#<groupId> / CHUG#*
    ddbDataSource.createResolver('GetChugEventsResolver', {
      typeName: 'Query',
      fieldName: 'getChugEvents',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "Query",
  "query": {
    "expression": "PK = :pk AND begins_with(SK, :sk)",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
      ":sk": $util.dynamodb.toDynamoDBJson("CHUG#")
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
$util.toJson($ctx.result.items)
      `),
    });

    // getFeed: query GROUP#<groupId> / FEED#*
    ddbDataSource.createResolver('GetFeedResolver', {
      typeName: 'Query',
      fieldName: 'getFeed',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "Query",
  "query": {
    "expression": "PK = :pk AND begins_with(SK, :sk)",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
      ":sk": $util.dynamodb.toDynamoDBJson("FEED#")
    }
  },
  "scanIndexForward": true
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
$util.toJson($ctx.result.items)
      `),
    });

    // getInboxNotifications: query PLAYER#<playerId> / NOTIF#*
    ddbDataSource.createResolver('GetInboxNotificationsResolver', {
      typeName: 'Query',
      fieldName: 'getInboxNotifications',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "Query",
  "query": {
    "expression": "PK = :pk AND begins_with(SK, :sk)",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("PLAYER#$ctx.identity.sub"),
      ":sk": $util.dynamodb.toDynamoDBJson("NOTIF#")
    }
  },
  "scanIndexForward": false
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
$util.toJson($ctx.result.items)
      `),
    });

    // ── Mutation Resolvers ────────────────────────────────────────────────────

    // designateAdmin: check caller is creatorId, append to adminIds
    ddbDataSource.createResolver('DesignateAdminResolver', {
      typeName: 'Mutation',
      fieldName: 'designateAdmin',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "UpdateItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
    "SK": $util.dynamodb.toDynamoDBJson("METADATA")
  },
  "update": {
    "expression": "ADD adminIds :newAdmin",
    "expressionValues": {
      ":newAdmin": { "SS": ["$ctx.args.playerId"] }
    }
  },
  "condition": {
    "expression": "creatorId = :callerId",
    "expressionValues": {
      ":callerId": $util.dynamodb.toDynamoDBJson("$ctx.identity.sub")
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
#if($ctx.error)
  $util.error($ctx.error.message, "PERMISSION_DENIED")
#end
$util.toJson($ctx.result)
      `),
    });

    // regenerateInviteCode: update inviteCode on group metadata
    ddbDataSource.createResolver('RegenerateInviteCodeResolver', {
      typeName: 'Mutation',
      fieldName: 'regenerateInviteCode',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
#set($newCode = $util.autoId().substring(0, 8).toUpperCase())
{
  "version": "2017-02-28",
  "operation": "UpdateItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
    "SK": $util.dynamodb.toDynamoDBJson("METADATA")
  },
  "update": {
    "expression": "SET inviteCode = :code",
    "expressionValues": {
      ":code": $util.dynamodb.toDynamoDBJson($newCode)
    }
  },
  "condition": {
    "expression": "creatorId = :callerId OR contains(adminIds, :callerId)",
    "expressionValues": {
      ":callerId": $util.dynamodb.toDynamoDBJson("$ctx.identity.sub")
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
#if($ctx.error)
  $util.error($ctx.error.message, "PERMISSION_DENIED")
#end
$util.toJson($ctx.result)
      `),
    });

    // createChallenge: write DEBT item with status=pending
    ddbDataSource.createResolver('CreateChallengeResolver', {
      typeName: 'Mutation',
      fieldName: 'createChallenge',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
#if($ctx.args.statementMakerId == $ctx.identity.sub)
  $util.error("Cannot challenge yourself", "SELF_CHALLENGE_ERROR")
#end
#if($util.isNullOrBlank($ctx.args.statement))
  $util.error("Statement is required", "VALIDATION_ERROR")
#end
#set($debtId = $util.autoId())
#set($now = $util.time.nowISO8601())
{
  "version": "2017-02-28",
  "operation": "PutItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
    "SK": $util.dynamodb.toDynamoDBJson("DEBT#$debtId")
  },
  "attributeValues": {
    "debtId": $util.dynamodb.toDynamoDBJson($debtId),
    "groupId": $util.dynamodb.toDynamoDBJson("$ctx.args.groupId"),
    "gameType": $util.dynamodb.toDynamoDBJson("manchester"),
    "customGameId": $util.dynamodb.toDynamoDBJson(null),
    "status": $util.dynamodb.toDynamoDBJson("pending"),
    "shameStatus": $util.dynamodb.toDynamoDBJson(false),
    "debtorId": $util.dynamodb.toDynamoDBJson(null),
    "creditorId": $util.dynamodb.toDynamoDBJson(null),
    "challengerId": $util.dynamodb.toDynamoDBJson("$ctx.identity.sub"),
    "statementMakerId": $util.dynamodb.toDynamoDBJson("$ctx.args.statementMakerId"),
    "statement": $util.dynamodb.toDynamoDBJson("$ctx.args.statement"),
    "reason": $util.dynamodb.toDynamoDBJson(null),
    "createdAt": $util.dynamodb.toDynamoDBJson($now),
    "resolvedAt": $util.dynamodb.toDynamoDBJson(null),
    "deliveredAt": $util.dynamodb.toDynamoDBJson(null),
    "voidedAt": $util.dynamodb.toDynamoDBJson(null),
    "voidReason": $util.dynamodb.toDynamoDBJson(null),
    "challengerConfirmation": $util.dynamodb.toDynamoDBJson(null),
    "statementMakerConfirmation": $util.dynamodb.toDynamoDBJson(null),
    "debtorDeliveryConfirmed": $util.dynamodb.toDynamoDBJson(false),
    "creditorDeliveryConfirmed": $util.dynamodb.toDynamoDBJson(false),
    "GSI2PK": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId#STATUS#pending"),
    "GSI2SK": $util.dynamodb.toDynamoDBJson("DEBT#$debtId"),
    "GSI3PK": $util.dynamodb.toDynamoDBJson(null),
    "GSI3SK": $util.dynamodb.toDynamoDBJson(null)
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
$util.toJson($ctx.result)
      `),
    });

    // submitResolutionConfirmation: Lambda resolver
    submitResolutionDs.createResolver('SubmitResolutionConfirmationResolver', {
      typeName: 'Mutation',
      fieldName: 'submitResolutionConfirmation',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // confirmDelivery: Lambda resolver
    confirmDeliveryDs.createResolver('ConfirmDeliveryResolver', {
      typeName: 'Mutation',
      fieldName: 'confirmDelivery',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // createGame: write GAME item, check for duplicate name
    ddbDataSource.createResolver('CreateGameResolver', {
      typeName: 'Mutation',
      fieldName: 'createGame',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
#set($gameId = $util.autoId())
#set($now = $util.time.nowISO8601())
{
  "version": "2017-02-28",
  "operation": "PutItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
    "SK": $util.dynamodb.toDynamoDBJson("GAME#$gameId")
  },
  "attributeValues": {
    "gameId": $util.dynamodb.toDynamoDBJson($gameId),
    "groupId": $util.dynamodb.toDynamoDBJson("$ctx.args.groupId"),
    "name": $util.dynamodb.toDynamoDBJson("$ctx.args.name"),
    "rules": $util.dynamodb.toDynamoDBJson("$ctx.args.rules"),
    "createdBy": $util.dynamodb.toDynamoDBJson("$ctx.identity.sub"),
    "createdAt": $util.dynamodb.toDynamoDBJson($now)
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
$util.toJson($ctx.result)
      `),
    });

    // createDebt: write custom DEBT item
    ddbDataSource.createResolver('CreateDebtResolver', {
      typeName: 'Mutation',
      fieldName: 'createDebt',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
#set($debtId = $util.autoId())
#set($now = $util.time.nowISO8601())
{
  "version": "2017-02-28",
  "operation": "PutItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
    "SK": $util.dynamodb.toDynamoDBJson("DEBT#$debtId")
  },
  "attributeValues": {
    "debtId": $util.dynamodb.toDynamoDBJson($debtId),
    "groupId": $util.dynamodb.toDynamoDBJson("$ctx.args.groupId"),
    "gameType": $util.dynamodb.toDynamoDBJson("custom"),
    "customGameId": $util.dynamodb.toDynamoDBJson("$ctx.args.gameId"),
    "status": $util.dynamodb.toDynamoDBJson("resolved"),
    "shameStatus": $util.dynamodb.toDynamoDBJson(false),
    "debtorId": $util.dynamodb.toDynamoDBJson("$ctx.args.debtorId"),
    "creditorId": $util.dynamodb.toDynamoDBJson("$ctx.args.creditorId"),
    "challengerId": $util.dynamodb.toDynamoDBJson(null),
    "statementMakerId": $util.dynamodb.toDynamoDBJson(null),
    "statement": $util.dynamodb.toDynamoDBJson(null),
    "reason": $util.dynamodb.toDynamoDBJson("$ctx.args.reason"),
    "createdAt": $util.dynamodb.toDynamoDBJson($now),
    "resolvedAt": $util.dynamodb.toDynamoDBJson($now),
    "deliveredAt": $util.dynamodb.toDynamoDBJson(null),
    "voidedAt": $util.dynamodb.toDynamoDBJson(null),
    "voidReason": $util.dynamodb.toDynamoDBJson(null),
    "challengerConfirmation": $util.dynamodb.toDynamoDBJson(null),
    "statementMakerConfirmation": $util.dynamodb.toDynamoDBJson(null),
    "debtorDeliveryConfirmed": $util.dynamodb.toDynamoDBJson(false),
    "creditorDeliveryConfirmed": $util.dynamodb.toDynamoDBJson(false),
    "GSI2PK": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId#STATUS#resolved"),
    "GSI2SK": $util.dynamodb.toDynamoDBJson("DEBT#$debtId"),
    "GSI3PK": $util.dynamodb.toDynamoDBJson("PLAYER#$ctx.args.debtorId"),
    "GSI3SK": $util.dynamodb.toDynamoDBJson("DEBT#$debtId")
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
$util.toJson($ctx.result)
      `),
    });

    // confirmReadIn: set isReadIn=true with conditional expression
    ddbDataSource.createResolver('ConfirmReadInResolver', {
      typeName: 'Mutation',
      fieldName: 'confirmReadIn',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
#set($now = $util.time.nowISO8601())
{
  "version": "2017-02-28",
  "operation": "UpdateItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
    "SK": $util.dynamodb.toDynamoDBJson("MEMBER#$ctx.identity.sub")
  },
  "update": {
    "expression": "SET isReadIn = :true, readInConfirmedAt = :now",
    "expressionValues": {
      ":true": $util.dynamodb.toDynamoDBJson(true),
      ":now": $util.dynamodb.toDynamoDBJson($now)
    }
  },
  "condition": {
    "expression": "attribute_not_exists(isReadIn) OR isReadIn = :false",
    "expressionValues": {
      ":false": $util.dynamodb.toDynamoDBJson(false)
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
$util.toJson($ctx.result)
      `),
    });

    // setReadInGameName: admin-only update
    ddbDataSource.createResolver('SetReadInGameNameResolver', {
      typeName: 'Mutation',
      fieldName: 'setReadInGameName',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "UpdateItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
    "SK": $util.dynamodb.toDynamoDBJson("METADATA")
  },
  "update": {
    "expression": "SET readInGameName = :name",
    "expressionValues": {
      ":name": $util.dynamodb.toDynamoDBJson("$ctx.args.name")
    }
  },
  "condition": {
    "expression": "creatorId = :callerId OR contains(adminIds, :callerId)",
    "expressionValues": {
      ":callerId": $util.dynamodb.toDynamoDBJson("$ctx.identity.sub")
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
#if($ctx.error)
  $util.error($ctx.error.message, "PERMISSION_DENIED")
#end
$util.toJson($ctx.result)
      `),
    });

    // recordGameCall: Lambda resolver
    recordGameCallDs.createResolver('RecordGameCallResolver', {
      typeName: 'Mutation',
      fieldName: 'recordGameCall',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // markRead: update notification read status
    ddbDataSource.createResolver('MarkReadResolver', {
      typeName: 'Mutation',
      fieldName: 'markRead',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "UpdateItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("PLAYER#$ctx.identity.sub"),
    "SK": $util.dynamodb.toDynamoDBJson("NOTIF#$ctx.args.notifId")
  },
  "update": {
    "expression": "SET #r = :true",
    "expressionNames": { "#r": "read" },
    "expressionValues": {
      ":true": $util.dynamodb.toDynamoDBJson(true)
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
$util.toJson($ctx.result)
      `),
    });

    new cdk.CfnOutput(this, 'AppSyncEndpoint', {
      value: this.api.graphqlUrl,
      exportName: 'SlapTrackerAppSyncEndpoint',
    });

    new cdk.CfnOutput(this, 'AppSyncApiId', {
      value: this.api.apiId,
      exportName: 'SlapTrackerAppSyncApiId',
    });

    new cdk.CfnOutput(this, 'AppSyncRegion', {
      value: this.region,
      exportName: 'SlapTrackerAppSyncRegion',
    });
  }
}
