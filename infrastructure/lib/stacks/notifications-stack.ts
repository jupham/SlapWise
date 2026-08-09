import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export interface NotificationsStackProps extends cdk.StackProps {
  stage: string;
}

/**
 * The fan-out point between a mutation and a push notification.
 *
 * Mutations publish here and return; the dispatcher subscribes and does the
 * delivery. Keeping SNS in the middle means a slow or failing push service
 * cannot make a Manchester take longer to call.
 *
 * There was a Pinpoint app here too, created for a push implementation that was
 * never written. Delivery now goes through Expo's push service, which already
 * holds this project's FCM and APNs credentials via EAS, and AWS has put
 * Pinpoint on a deprecation path — so it was removed rather than wired up.
 */
export class NotificationsStack extends cdk.Stack {
  public readonly snsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: NotificationsStackProps) {
    super(scope, id, props);
    const { stage } = props;

    this.snsTopic = new sns.Topic(this, 'SlapWiseNotificationsTopic', {
      topicName: `${stage}-SlapWiseNotifications`,
      displayName: 'SlapWise Notifications',
    });

    new cdk.CfnOutput(this, 'SnsTopicArn', {
      value: this.snsTopic.topicArn,
      exportName: `${stage}-SlapWiseSnsTopicArn`,
    });
  }
}
