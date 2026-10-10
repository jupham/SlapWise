import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as path from 'path';
import { Construct } from 'constructs';

export interface LambdaStackProps extends cdk.StackProps {
  stage: string;
  table: dynamodb.Table;
  snsTopic: sns.Topic;
}

export class LambdaStack extends cdk.Stack {
  public readonly preSignUpFn: lambda.Function;
  public readonly postConfirmationFn: lambda.Function;
  public readonly createGroupFn: lambda.Function;
  public readonly joinGroupFn: lambda.Function;
  public readonly getGroupFn: lambda.Function;
  public readonly getGroupsFn: lambda.Function;
  public readonly deleteGroupFn: lambda.Function;
  public readonly createChallengeFn: lambda.Function;
  public readonly submitResolutionConfirmationFn: lambda.Function;
  public readonly confirmDeliveryFn: lambda.Function;
  public readonly gameCallFn: lambda.Function;
  public readonly getFeedFn: lambda.Function;
  public readonly regenerateInviteCodeFn: lambda.Function;
  public readonly voidDebtFn: lambda.Function;
  public readonly leaveGroupFn: lambda.Function;
  public readonly notificationDispatcherFn: lambda.Function;
  public readonly grogResolverFn: lambda.Function;
  public readonly confirmReadInFn: lambda.Function;
  public readonly updateUsernameFn: lambda.Function;
  public readonly deleteAccountFn: lambda.Function;
  public readonly registerPushTokenFn: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const { stage, table, snsTopic } = props;

    const commonEnv = {
      TABLE_NAME: table.tableName,
      SNS_TOPIC_ARN: snsTopic.topicArn,
    };

    const lambdaDefaults = {
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    } satisfies Partial<lambda.FunctionProps>;

    /**
     * One asset for every function, rooted at dist/lambda, with the directory
     * name moved into the handler path.
     *
     * It used to be an asset per function directory, which silently broke the
     * moment a Lambda imported anything from `lambda/shared/`. tsc emits that
     * import as `require('../shared/cors')`, which resolves above the asset
     * root — so the file was simply absent from the package and the function
     * died at cold start on MODULE_NOT_FOUND. Nothing caught it because tsc
     * only ever sees the source tree, where the path is real.
     *
     * There is no bundler in this pipeline to inline the import, so the fix is
     * to make the relative path true at runtime by shipping the tree rather
     * than the leaf. CDK hashes the directory once, so this is a single upload
     * shared by every function instead of twenty near-identical ones.
     */
    const lambdaCode = lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda'));

    // Pre-sign-up trigger (username uniqueness check)
    this.preSignUpFn = new lambda.Function(this, 'PreSignUpFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-pre-sign-up`,
      handler: 'pre-sign-up/index.handler',
      code: lambdaCode,
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantReadData(this.preSignUpFn);

    // Post-confirmation trigger (write player profile to DynamoDB)
    this.postConfirmationFn = new lambda.Function(this, 'PostConfirmationFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-post-confirmation`,
      handler: 'post-confirmation/index.handler',
      code: lambdaCode,
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantWriteData(this.postConfirmationFn);

    // createGroup Lambda (invoked via API Gateway)
    this.createGroupFn = new lambda.Function(this, 'CreateGroupFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-create-group`,
      handler: 'create-group/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.createGroupFn);

    // joinGroup Lambda (invoked via API Gateway)
    this.joinGroupFn = new lambda.Function(this, 'JoinGroupFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-join-group`,
      handler: 'join-group/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.joinGroupFn);
    snsTopic.grantPublish(this.joinGroupFn);

    // getGroup Lambda (invoked via API Gateway)
    this.getGroupFn = new lambda.Function(this, 'GetGroupFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-get-group`,
      handler: 'get-group/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadData(this.getGroupFn);

    // getGroups Lambda (invoked via API Gateway — queries GSI1 for all groups the caller belongs to)
    this.getGroupsFn = new lambda.Function(this, 'GetGroupsFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-get-groups`,
      handler: 'get-groups/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadData(this.getGroupsFn);

    // deleteGroup Lambda (invoked via API Gateway)
    this.deleteGroupFn = new lambda.Function(this, 'DeleteGroupFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-delete-group`,
      handler: 'delete-group/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.deleteGroupFn);

    // createChallenge Lambda (AppSync resolver — TransactWrite for GSI4 fan-out)
    this.createChallengeFn = new lambda.Function(this, 'CreateChallengeFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-create-challenge`,
      handler: 'create-challenge/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.createChallengeFn);
    snsTopic.grantPublish(this.createChallengeFn);

    // submitResolutionConfirmation Lambda (AppSync resolver)
    this.submitResolutionConfirmationFn = new lambda.Function(this, 'SubmitResolutionConfirmationFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-submit-resolution-confirmation`,
      handler: 'submit-resolution-confirmation/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.submitResolutionConfirmationFn);
    snsTopic.grantPublish(this.submitResolutionConfirmationFn);

    // confirmDelivery Lambda (AppSync resolver)
    this.confirmDeliveryFn = new lambda.Function(this, 'ConfirmDeliveryFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-confirm-delivery`,
      handler: 'confirm-delivery/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.confirmDeliveryFn);
    snsTopic.grantPublish(this.confirmDeliveryFn);

    // gameCall Lambda (AppSync resolver) — callGame, respondToGameCall and
    // getGameCalls, all read-in only.
    this.gameCallFn = new lambda.Function(this, 'GameCallFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-game-call`,
      handler: 'game-call/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.gameCallFn);
    snsTopic.grantPublish(this.gameCallFn);

    // getFeed Lambda (AppSync resolver) — redacts read-in entries for players
    // who are not read in, which a direct DynamoDB resolver could not do.
    this.getFeedFn = new lambda.Function(this, 'GetFeedFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-get-feed`,
      handler: 'get-feed/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadData(this.getFeedFn);

    // regenerateInviteCode Lambda (AppSync resolver)
    this.regenerateInviteCodeFn = new lambda.Function(this, 'RegenerateInviteCodeFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-regenerate-invite-code`,
      handler: 'regenerate-invite-code/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.regenerateInviteCodeFn);

    // voidDebt Lambda (AppSync resolver — hard-delete DEBT + 2× PLAYERDEBT)
    this.voidDebtFn = new lambda.Function(this, 'VoidDebtFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-void-debt`,
      handler: 'void-debt/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.voidDebtFn);

    // leaveGroup Lambda (AppSync resolver)
    this.leaveGroupFn = new lambda.Function(this, 'LeaveGroupFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-leave-group`,
      handler: 'leave-group/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.leaveGroupFn);
    snsTopic.grantPublish(this.leaveGroupFn);

    // updateUsername Lambda (REST) — fans a display-name change out across the
    // Player PROFILE and every denormalised Member copy.
    this.updateUsernameFn = new lambda.Function(this, 'UpdateUsernameFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-update-username`,
      handler: 'update-username/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.updateUsernameFn);

    // deleteAccount Lambda (REST) — deletes the Player PROFILE and anonymises
    // every Member copy. Same GSI1 fan-out as updateUsername, and Cognito is
    // left to the client for the same circular-dependency reason.
    this.deleteAccountFn = new lambda.Function(this, 'DeleteAccountFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-delete-account`,
      handler: 'delete-account/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.deleteAccountFn);

    // registerPushToken Lambda (REST) — one record per device, so a player
    // signed in on a phone and a tablet gets both.
    this.registerPushTokenFn = new lambda.Function(this, 'RegisterPushTokenFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-register-push-token`,
      handler: 'register-push-token/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.registerPushTokenFn);

    // notificationDispatcher Lambda
    this.notificationDispatcherFn = new lambda.Function(this, 'NotificationDispatcherFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-notification-dispatcher`,
      handler: 'notification-dispatcher/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.notificationDispatcherFn);
    // Subscribed, not granted publish. It had the latter, which is the wrong
    // direction — every producer published happily into a topic with no
    // subscribers, so the dispatcher was never once invoked.
    snsTopic.addSubscription(new subs.LambdaSubscription(this.notificationDispatcherFn));

    // grogResolver Lambda (AppSync resolver — all grog mutations)
    this.grogResolverFn = new lambda.Function(this, 'GrogResolverFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-grog-resolver`,
      handler: 'grog-resolver/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.grogResolverFn);
    snsTopic.grantPublish(this.grogResolverFn);

    // confirmReadIn Lambda (AppSync resolver — sets isReadIn=true + notifies existing read-in players)
    this.confirmReadInFn = new lambda.Function(this, 'ConfirmReadInFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slapwise-confirm-read-in`,
      handler: 'confirm-read-in/index.handler',
      code: lambdaCode,
      environment: commonEnv,
    });
    table.grantReadWriteData(this.confirmReadInFn);
    snsTopic.grantPublish(this.confirmReadInFn);
  }
}
