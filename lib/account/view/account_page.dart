import 'package:flutter/cupertino.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:slapwise/account/cubit/account_cubit.dart';

class AccountPage extends StatelessWidget {
  const AccountPage({super.key});

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      navigationBar: const CupertinoNavigationBar(
        middle: Text('Account'),
      ),
      child: BlocBuilder<AccountCubit, AccountState>(
        builder: (context, state) {
          if (state is AccountLoading) {
            return const Center(
              child: Text('Loading')
            );
          }
          else if (state is AccountLoaded) {
            return Center(
              child: Text(state.account.email ?? "")
            );
          }

          return const Center(
              child: Text('null')
            );
        }
      )
    );
  }
}