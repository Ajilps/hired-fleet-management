import 'package:driver_app/core/route/app_routes.dart';
import 'package:driver_app/presentation/screens/login_screen/login_screen.dart';
import 'package:driver_app/presentation/screens/register_screen/driver_application/driver_application_screen.dart';
import 'package:driver_app/presentation/screens/register_screen/driver_documents/driver_documents_replace.dart';
import 'package:driver_app/presentation/screens/register_screen/driver_documents/driver_documents_screen.dart';
import 'package:driver_app/presentation/screens/splash_screen/splash_screen.dart';
import 'package:flutter/material.dart';

class AppRouter {
  static Map<String, WidgetBuilder> appRouters = {
    AppRoutes.splash: (context) => SplashScreen(),
    AppRoutes.login: (context) => LoginScreen(),
    AppRoutes.driverApplication: (context) => DriverApplicationScreen(),
    AppRoutes.driverDocuments: (context) => DriverDocumentsScreen(),
     AppRoutes.driverDocumentsReplace: (context) => DriverDocumentsReplace(),
  };
}
