import 'package:driver_app/core/route/app_router.dart';
import 'package:driver_app/core/route/app_routes.dart';
import 'package:driver_app/core/theme/app_theme.dart';
import 'package:driver_app/presentation/controllers/auth_controller/auth_controller.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

class DriverApp extends StatelessWidget {
  const new({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(providers: [ChangeNotifierProvider(create: (context) => AuthController(),)],
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        initialRoute: AppRoutes.driverDocumentsReplace,
        routes: AppRouter.appRouters,
        theme: AppTheme.light,
      ),
    );
  }
}
