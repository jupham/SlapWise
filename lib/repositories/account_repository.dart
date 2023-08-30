import 'dart:async';
import 'package:amplify_api/amplify_api.dart';
import 'package:amplify_flutter/amplify_flutter.dart';
import 'package:slapwise/models/models.dart';
import 'package:slapwise/amplify_models/ModelProvider.dart' as amplify;


class AccountRepository {
  Account? _account;

  Future<Account?> getAccount() async {
    if (_account != null) return _account;
    try {
      final result = await Amplify.Auth.fetchUserAttributes();
      final AuthUserAttribute subAttribute = result.firstWhere((element) => element.userAttributeKey == AuthUserAttributeKey.sub);
      final AuthUserAttribute emailAttribute = result.firstWhere((element) => element.userAttributeKey == AuthUserAttributeKey.email);

      final request = ModelQueries.get(
        amplify.Account.classType,
        amplify.AccountModelIdentifier(id: subAttribute.value)
      );
      final accountResponse = await Amplify.API.query(request: request).response;      
      amplify.Account? account = accountResponse.data;
      if (account == null) {
        // Create new account model
        account = amplify.Account(id: subAttribute.value, emailAddress: emailAttribute.value);
        final createRequest = ModelMutations.create(account);
        final createResponse = await Amplify.API.mutate(request: createRequest).response;
        account = createResponse.data;
      }
      return Account(account!.id, account.emailAddress, account.firstName, account.lastName, account.hasBeenReadIn ?? false);
    } catch (e) {
      safePrint('Query failed: $e');
      return null;
    }
  }
}
