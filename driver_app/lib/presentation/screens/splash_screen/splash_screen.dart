import 'package:driver_app/core/route/app_routes.dart';
import 'package:driver_app/core/theme/app_colors.dart';
import 'package:driver_app/core/theme/app_radius.dart';
import 'package:driver_app/core/theme/app_text_style.dart';
import 'package:flutter/material.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import 'package:flutter_svg/svg.dart';
import 'package:lottie/lottie.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    validateAuth(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        children: [
          Positioned(
            left: 0,
            right: 0,
            bottom: 60,
            child: Opacity(
              opacity: 0.5,
              child: SvgPicture.asset(
                'assets/svg/map.svg',
                height: 300,
                fit: BoxFit.fitWidth,
              ),
            ),
          ),

          SafeArea(
            child: SizedBox.expand(
              child: Column(
                children: [
                  const Spacer(flex: 4),

                  Lottie.asset('assets/animation/logo.json', height: 125),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      vertical: 5,
                      horizontal: 15,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.onPrimary,
                      borderRadius: BorderRadius.circular(
                        AppRadius.buttonRadius,
                      ),
                    ),
                    child: Text(
                      'DRIVER',
                      style: AppTextStyles.smallContainerBox,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'Drive. Deliver. Get paid.',
                    style: AppTextStyles.bodySmall,
                  ),

                  const Spacer(flex: 5),

                  const SpinKitThreeBounce(color: AppColors.primary, size: 20),
                  const SizedBox(height: 24),
                  Text.rich(
                    TextSpan(
                      text: 'Powered by ',
                      style: AppTextStyles.caption,
                      children: [
                        TextSpan(text: 'HireD', style: AppTextStyles.label),
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> validateAuth(BuildContext context) async {
  await Future.delayed(const Duration(seconds: 6));
  if (!context.mounted) return;

  Navigator.pushReplacementNamed(context, AppRoutes.login);
}
