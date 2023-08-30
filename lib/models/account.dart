import 'package:equatable/equatable.dart';

class Account extends Equatable {
  const Account(this.id, this.email, this.firstName, this.lastName, this.hasBeenReadIn);

  final String id;
  final String? email;
  final String? firstName;
  final String? lastName;
  final bool hasBeenReadIn;

  @override
  List<Object> get props => [id];

  static const empty = Account("-", null, null, null , false);
}