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

    this.api = new appsync.GraphqlApi(this, 'SlapWiseApi', {
      name: `${stage}-SlapWiseApi`,
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

    const ddbDataSource = this.api.addDynamoDbDataSource('SlapWiseDdbSource', table);

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

    const leaveGroupDs = this.api.addLambdaDataSource(
      'LeaveGroupDs',
      lambdaStack.leaveGroupFn
    );

    const regenerateInviteCodeDs = this.api.addLambdaDataSource(
      'RegenerateInviteCodeDs',
      lambdaStack.regenerateInviteCodeFn
    );

    const gameCallDs = this.api.addLambdaDataSource(
      'GameCallDs',
      lambdaStack.gameCallFn
    );

    const getFeedDs = this.api.addLambdaDataSource(
      'GetFeedDs',
      lambdaStack.getFeedFn
    );

    const confirmReadInDs = this.api.addLambdaDataSource(
      'ConfirmReadInDs',
      lambdaStack.confirmReadInFn
    );

    const grogResolverDs = this.api.addLambdaDataSource(
      'GrogResolverDs',
      lambdaStack.grogResolverFn
    );

    // ── Membership gate ───────────────────────────────────────────────────────
    //
    // Every read of a group's data must come from a member of that group. These
    // resolvers used to query on the groupId argument alone, so any signed-in
    // user holding a group's id — including someone who had left — could read
    // its members, debts and grog. Each now runs as a pipeline whose first step
    // looks up the caller's Member row and refuses with Unauthorized if there
    // is none. Fields that read only the caller's own rows (getGroups,
    // getMyDebts) key on $ctx.identity.sub and need no gate.
    const requireMemberFn = new appsync.AppsyncFunction(this, 'RequireMemberFn', {
      api: this.api,
      dataSource: ddbDataSource,
      name: 'requireMember',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2018-05-29",
  "operation": "GetItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
    "SK": $util.dynamodb.toDynamoDBJson("MEMBER#$ctx.identity.sub")
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
#if($ctx.error) $util.error($ctx.error.message, $ctx.error.type) #end
#if($util.isNull($ctx.result)) $util.unauthorized() #end
$util.toJson($ctx.result)
      `),
    });

    /**
     * A query that runs only after requireMember passes. `request` and
     * `response` are the field's own templates; a 2018-05-29 function does not
     * raise data-source errors by itself, so the response is guarded here.
     */
    const memberGated = (id: string, typeName: string, fieldName: string, request: string, response: string) => {
      const queryFn = new appsync.AppsyncFunction(this, `${id}Fn`, {
        api: this.api,
        dataSource: ddbDataSource,
        name: fieldName,
        requestMappingTemplate: appsync.MappingTemplate.fromString(request),
        responseMappingTemplate: appsync.MappingTemplate.fromString(
          `#if($ctx.error) $util.error($ctx.error.message, $ctx.error.type) #end\n${response}`
        ),
      });
      // Scoped to the API with the old id, so CloudFormation updates the
      // existing resolver in place rather than creating a second one.
      new appsync.Resolver(this.api, id, {
        api: this.api,
        typeName,
        fieldName,
        pipelineConfig: [requireMemberFn, queryFn],
        requestMappingTemplate: appsync.MappingTemplate.fromString('{}'),
        responseMappingTemplate: appsync.MappingTemplate.fromString('$util.toJson($ctx.prev.result)'),
      });
    };

    // Subscriptions are checked once, at subscribe time. Without this anyone
    // could listen on a group's id — onGroupUpdated even carries a freshly
    // regenerated invite code.
    for (const [id, fieldName] of [
      ['OnDebtUpdatedResolver', 'onDebtUpdated'],
      ['OnGroupUpdatedResolver', 'onGroupUpdated'],
    ]) {
      new appsync.Resolver(this.api, id, {
        api: this.api,
        typeName: 'Subscription',
        fieldName,
        pipelineConfig: [requireMemberFn],
        requestMappingTemplate: appsync.MappingTemplate.fromString('{}'),
        responseMappingTemplate: appsync.MappingTemplate.fromString('$util.toJson(null)'),
      });
    }

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
    memberGated('GetGroupMembersResolver', 'Query', 'getGroupMembers', `
{
  "version": "2018-05-29",
  "operation": "Query",
  "query": {
    "expression": "PK = :pk AND begins_with(SK, :sk)",
    "expressionValues": {
      ":pk": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
      ":sk": $util.dynamodb.toDynamoDBJson("MEMBER#")
    }
  }
}
      `, `$util.toJson($ctx.result.items)`);

    // getDebt: GetItem by PK/SK
    memberGated('GetDebtResolver', 'Query', 'getDebt', `
{
  "version": "2018-05-29",
  "operation": "GetItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("GROUP#$ctx.args.groupId"),
    "SK": $util.dynamodb.toDynamoDBJson("DEBT#$ctx.args.debtId")
  }
}
      `, `$util.toJson($ctx.result)`);

    // getDebts: query GSI2 with optional status filter (defaults to pending)
    memberGated('GetDebtsResolver', 'Query', 'getDebts', `
#set($status = $util.defaultIfNullOrBlank($ctx.args.status, "pending"))
{
  "version": "2018-05-29",
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
      `, `$util.toJson($ctx.result.items)`);

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
    memberGated('GetReadInPlayersResolver', 'Query', 'getReadInPlayers', `
{
  "version": "2018-05-29",
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
      `, `$util.toJson($ctx.result.items)`);

    // getFeed: Lambda — newest first, read-in entries redacted for outsiders
    getFeedDs.createResolver('GetFeedResolver', {
      typeName: 'Query',
      fieldName: 'getFeed',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // getGameCalls: Lambda (read-in only)
    gameCallDs.createResolver('GetGameCallsResolver', {
      typeName: 'Query',
      fieldName: 'getGameCalls',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
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

    // leaveGroup: Lambda (deletes the Member row and the leaver's undelivered debts)
    leaveGroupDs.createResolver('LeaveGroupResolver', {
      typeName: 'Mutation',
      fieldName: 'leaveGroup',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // confirmReadIn: Lambda (sets isReadIn=true + notifies existing read-in players)
    confirmReadInDs.createResolver('ConfirmReadInResolver', {
      typeName: 'Mutation',
      fieldName: 'confirmReadIn',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
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

    // getReadInRules / setReadInRules: Lambda (read-in only; set is admin-only too)
    gameCallDs.createResolver('GetReadInRulesResolver', {
      typeName: 'Query',
      fieldName: 'getReadInRules',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    gameCallDs.createResolver('SetReadInRulesResolver', {
      typeName: 'Mutation',
      fieldName: 'setReadInRules',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // callGame / respondToGameCall: Lambda (read-in only)
    gameCallDs.createResolver('CallGameResolver', {
      typeName: 'Mutation',
      fieldName: 'callGame',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    gameCallDs.createResolver('RespondToGameCallResolver', {
      typeName: 'Mutation',
      fieldName: 'respondToGameCall',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // getGrog: direct DynamoDB GetItem by PK = GROG#<groupId>, SK = METADATA
    // Returns { entries: [], history: [] } when item not found
    memberGated('GetGrogResolver', 'Query', 'getGrog', `
{
  "version": "2018-05-29",
  "operation": "GetItem",
  "key": {
    "PK": $util.dynamodb.toDynamoDBJson("GROG#$ctx.args.groupId"),
    "SK": $util.dynamodb.toDynamoDBJson("METADATA")
  }
}
      `, `
#if($util.isNull($ctx.result))
  $util.toJson({ "groupId": "$ctx.args.groupId", "bottleSize": 0, "entries": [], "history": [], "pendingAddBacks": [] })
#else
  #set($result = $ctx.result)
  #if($util.isNull($result.pendingAddBacks))
    $util.qr($result.put("pendingAddBacks", []))
  #end
  $util.toJson($result)
#end
      `);

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
      exportName: `${stage}-SlapWiseAppSyncEndpoint`,
    });

    new cdk.CfnOutput(this, 'AppSyncApiId', {
      value: this.api.apiId,
      exportName: `${stage}-SlapWiseAppSyncApiId`,
    });

    new cdk.CfnOutput(this, 'AppSyncRegion', {
      value: this.region,
      exportName: `${stage}-SlapWiseAppSyncRegion`,
    });
  }
}
