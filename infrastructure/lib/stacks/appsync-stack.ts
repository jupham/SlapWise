import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';
import { Construct } from 'constructs';
import { LambdaStack } from './lambda-stack';

export interface AppSyncStackProps extends cdk.StackProps {
  stage: string;
  table: dynamodb.Table;
  userPool: cognito.UserPool;
  lambdaStack: LambdaStack;
}

export class AppSyncStack extends cdk.Stack {
  public readonly api: appsync.GraphqlApi;

  constructor(scope: Construct, id: string, props: AppSyncStackProps) {
    super(scope, id, props);

    const { stage, table, userPool, lambdaStack } = props;

    this.api = new appsync.GraphqlApi(this, 'SlapTrackerApi', {
      name: `${stage}-SlapTrackerApi`,
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

    const createChallengeDs = this.api.addLambdaDataSource(
      'CreateChallengeDs',
      lambdaStack.createChallengeFn
    );

    const submitResolutionDs = this.api.addLambdaDataSource(
      'SubmitResolutionDs',
      lambdaStack.submitResolutionConfirmationFn
    );

    const confirmDeliveryDs = this.api.addLambdaDataSource(
      'ConfirmDeliveryDs',
      lambdaStack.confirmDeliveryFn
    );

    const voidDebtDs = this.api.addLambdaDataSource(
      'VoidDebtDs',
      lambdaStack.voidDebtFn
    );

    const regenerateInviteCodeDs = this.api.addLambdaDataSource(
      'RegenerateInviteCodeDs',
      lambdaStack.regenerateInviteCodeFn
    );

    const recordGameCallDs = this.api.addLambdaDataSource(
      'RecordGameCallDs',
      lambdaStack.recordGameCallFn
    );

    const grogResolverDs = this.api.addLambdaDataSource(
      'GrogResolverDs',
      lambdaStack.grogResolverFn
    );

    // ── Query Resolvers ───────────────────────────────────────────────────────

    // getGroups: query GSI1 — all groups the calling player is a member of
    ddbDataSource.createResolver('GetGroupsResolver', {
      typeName: 'Query',
      fieldName: 'getGroups',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "Query",
  "index": "GSI1",
  "query": {
    "expression": "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("PLAYER#$ctx.identity.sub"),
      ":sk": $util.dynamodb.toDynamoDBJson("GROUP#")
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`$util.toJson($ctx.result.items)`),
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
      responseMappingTemplate: appsync.MappingTemplate.fromString(`$util.toJson($ctx.result.items)`),
    });

    // getDebt: GetItem by PK/SK
    ddbDataSource.createResolver('GetDebtResolver', {
      typeName: 'Query',
      fieldName: 'getDebt',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "GetItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
    "SK": $util.dynamodb.toDynamoDBJson("DEBT#$ctx.args.debtId")
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`$util.toJson($ctx.result)`),
    });

    // getDebts: query GSI2 with optional status filter (defaults to pending)
    ddbDataSource.createResolver('GetDebtsResolver', {
      typeName: 'Query',
      fieldName: 'getDebts',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
#set($status = $util.defaultIfNullOrBlank($ctx.args.status, "pending"))
{
  "version": "2017-02-28",
  "operation": "Query",
  "index": "GSI2",
  "query": {
    "expression": "GSI2PK = :pk",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId#STATUS#$status")
    }
  },
  "scanIndexForward": false
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`$util.toJson($ctx.result.items)`),
    });

    // getMyDebts: query GSI4 — all debts for the calling player in a group (single query, full card data)
    ddbDataSource.createResolver('GetMyDebtsResolver', {
      typeName: 'Query',
      fieldName: 'getMyDebts',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "Query",
  "index": "GSI4",
  "query": {
    "expression": "GSI4PK = :pk",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("PLAYER#$ctx.identity.sub#GROUP#$ctx.args.groupId")
    }
  },
  "scanIndexForward": false
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`$util.toJson($ctx.result.items)`),
    });

    // getReadInPlayers: query MEMBER#* filtered by isReadIn = true
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
      responseMappingTemplate: appsync.MappingTemplate.fromString(`$util.toJson($ctx.result.items)`),
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
  },
  "scanIndexForward": false
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`$util.toJson($ctx.result.items)`),
    });

    // getFeed: query GROUP#<groupId> / FEED#* — newest first
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
  "scanIndexForward": false
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`$util.toJson($ctx.result.items)`),
    });

    // ── Mutation Resolvers ────────────────────────────────────────────────────

    // designateAdmin: caller must be creatorId
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

    // regenerateInviteCode: Lambda (writes new INVITE# lookup item)
    regenerateInviteCodeDs.createResolver('RegenerateInviteCodeResolver', {
      typeName: 'Mutation',
      fieldName: 'regenerateInviteCode',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // createChallenge: Lambda (TransactWrite — DEBT + 2× PLAYERDEBT + FEED entry)
    createChallengeDs.createResolver('CreateChallengeResolver', {
      typeName: 'Mutation',
      fieldName: 'createChallenge',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // submitResolutionConfirmation: Lambda
    submitResolutionDs.createResolver('SubmitResolutionConfirmationResolver', {
      typeName: 'Mutation',
      fieldName: 'submitResolutionConfirmation',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // confirmDelivery: Lambda
    confirmDeliveryDs.createResolver('ConfirmDeliveryResolver', {
      typeName: 'Mutation',
      fieldName: 'confirmDelivery',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // voidDebt: Lambda (hard-delete DEBT + 2× PLAYERDEBT via TransactWrite)
    voidDebtDs.createResolver('VoidDebtResolver', {
      typeName: 'Mutation',
      fieldName: 'voidDebt',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // confirmReadIn: set isReadIn=true on the calling player's MEMBER record
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
      responseMappingTemplate: appsync.MappingTemplate.fromString(`$util.toJson($ctx.result)`),
    });

    // setReadInGameName: admin-only update on GROUP METADATA
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

    // recordGameCall: Lambda (writes CHUG item + FEED entry)
    recordGameCallDs.createResolver('RecordGameCallResolver', {
      typeName: 'Mutation',
      fieldName: 'recordGameCall',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // getGrog: direct DynamoDB GetItem by PK = GROG#<groupId>, SK = METADATA
    // Returns { entries: [], history: [] } when item not found
    ddbDataSource.createResolver('GetGrogResolver', {
      typeName: 'Query',
      fieldName: 'getGrog',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "GetItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("GROG#$ctx.args.groupId"),
    "SK": $util.dynamodb.toDynamoDBJson("METADATA")
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
#if($util.isNull($ctx.result))
  $util.toJson({ "groupId": "$ctx.args.groupId", "bottleSize": 0, "entries": [], "history": [], "pendingAddBacks": [] })
#else
  #set($result = $ctx.result)
  #if($util.isNull($result.pendingAddBacks))
    $util.qr($result.put("pendingAddBacks", []))
  #end
  $util.toJson($result)
#end
      `),
    });

    // initializeGrog: Lambda
    grogResolverDs.createResolver('InitializeGrogResolver', {
      typeName: 'Mutation',
      fieldName: 'initializeGrog',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // addLiquorToGrog: Lambda
    grogResolverDs.createResolver('AddLiquorToGrogResolver', {
      typeName: 'Mutation',
      fieldName: 'addLiquorToGrog',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // removeLiquorFromGrog: Lambda
    grogResolverDs.createResolver('RemoveLiquorFromGrogResolver', {
      typeName: 'Mutation',
      fieldName: 'removeLiquorFromGrog',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // adjustGrogEntry: Lambda
    grogResolverDs.createResolver('AdjustGrogEntryResolver', {
      typeName: 'Mutation',
      fieldName: 'adjustGrogEntry',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // confirmGrogDelivery: Lambda (legacy — retained for backwards compatibility)
    grogResolverDs.createResolver('ConfirmGrogDeliveryResolver', {
      typeName: 'Mutation',
      fieldName: 'confirmGrogDelivery',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // takeGrogShot: Lambda
    grogResolverDs.createResolver('TakeGrogShotResolver', {
      typeName: 'Mutation',
      fieldName: 'takeGrogShot',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // redeemAddBack: Lambda
    grogResolverDs.createResolver('RedeemAddBackResolver', {
      typeName: 'Mutation',
      fieldName: 'redeemAddBack',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // clearAddBack: Lambda
    grogResolverDs.createResolver('ClearAddBackResolver', {
      typeName: 'Mutation',
      fieldName: 'clearAddBack',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // adminAddBack: Lambda
    grogResolverDs.createResolver('AdminAddBackResolver', {
      typeName: 'Mutation',
      fieldName: 'adminAddBack',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // ── Outputs ───────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'AppSyncEndpoint', {
      value: this.api.graphqlUrl,
      exportName: `${stage}-SlapTrackerAppSyncEndpoint`,
    });

    new cdk.CfnOutput(this, 'AppSyncApiId', {
      value: this.api.apiId,
      exportName: `${stage}-SlapTrackerAppSyncApiId`,
    });

    new cdk.CfnOutput(this, 'AppSyncRegion', {
      value: this.region,
      exportName: `${stage}-SlapTrackerAppSyncRegion`,
    });
  }
}
