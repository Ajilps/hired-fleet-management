import 'dart:io';

import 'package:driver_app/core/dialogs/app_dialogs.dart';
import 'package:driver_app/core/dialogs/document_picker/widgets/option_tile.dart';
import 'package:driver_app/core/enum/document_source.dart';
import 'package:driver_app/core/theme/app_colors.dart';
import 'package:driver_app/core/theme/app_radius.dart';
import 'package:driver_app/core/theme/app_spacing.dart';
import 'package:driver_app/core/theme/app_text_style.dart';
import 'package:driver_app/presentation/controllers/auth_controller/auth_controller.dart';
import 'package:driver_app/presentation/widgets/auth_widgets/auth_app_bar.dart';
import 'package:driver_app/presentation/widgets/auth_widgets/auth_button.dart';
import 'package:driver_app/presentation/widgets/auth_widgets/auth_label.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

class DriverDocumentsReplace extends StatelessWidget {
  const new({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: authAppBar(context, 'Replace Document'),
      body: SingleChildScrollView(
        child: Consumer<AuthController>(
          builder: (context, value, child) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 20),
              child: Column(
                children: [
                  SizedBox(height: AppSpacing.screen),
                  AuthLabel(label: 'Document Type'),
                  SizedBox(height: AppSpacing.gap),
                  DropdownMenuFormField<String>(
                    width: double.infinity,
                    hintText: 'Select document type',
                    expandedInsets: EdgeInsets.zero,
                    dropdownMenuEntries: const [
                      DropdownMenuEntry(
                        value: 'aadhaar',
                        label: 'Aadhaar Card',
                      ),
                      DropdownMenuEntry(value: 'pan', label: 'PAN Card'),
                      DropdownMenuEntry(
                        value: 'driving_licence',
                        label: 'Driving Licence',
                      ),
                      DropdownMenuEntry(
                        value: 'pcc',
                        label: 'Police Clearance Certificate',
                      ),
                    ],
                    onSelected: (value) {
                      print(value);
                    },
                  ),
                  SizedBox(height: AppSpacing.section),
                  value.path.isNotEmpty ? DocumentBanner(path: value.path,) : EmptyDocuments(),

                  SizedBox(height: AppSpacing.section),

                  AuthButtonWidget(
                    text: 'Upload document',
                    onPressed: () async {
                      await AppDialogs.showDocumentPicker(
                        context,
                        title: 'Upload document',
                        subtitle: 'Choose how you want to add it',
                        options: [
                          OptionTile(
                            icon: Icons.folder_open_rounded,
                            title: 'Choose file',
                            subtitle: 'PDF, JPG or PNG',
                            onTap: () {
                              Navigator.pop(context, DocumentSource.file);
                              context.read<AuthController>().pickFile(context);
                            },
                          ),
                          const SizedBox(height: 12),
                          OptionTile(
                            icon: Icons.photo_camera_outlined,
                            title: 'Take a photo',
                            subtitle: 'Use your camera to scan it',
                            onTap: () {
                              Navigator.pop(context, DocumentSource.camera);
                              context.read<AuthController>().pickImage(context);
                            },
                          ),
                        ],
                      );
                    },
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class DocumentBanner extends StatelessWidget {
  const new({super.key,required this.path});
 final String path;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
     
      decoration: BoxDecoration(
        color: AppColors.primaryDark.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(AppRadius.control),
        border: Border.all(
          color: AppColors.textPrimary.withValues(alpha: 0.15),
        ),
       
      ),child: ClipRRect(borderRadius: BorderRadius.circular( AppRadius.control,),
        child: Image.file(File(path),fit: BoxFit.cover,errorBuilder: (context, error, stackTrace) { return const Center( child: Text('Unable to display image'), ); },))
    );
  }
}

class EmptyDocuments extends StatelessWidget {
  const new({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 30, horizontal: 16),
      decoration: BoxDecoration(
        color: AppColors.primaryDark.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(AppRadius.control),
        border: Border.all(
          color: AppColors.textPrimary.withValues(alpha: 0.15),
        ),
      ),
      child: Column(
        children: [
          Icon(
            Icons.folder_open_outlined,
            size: 40,
            color: AppColors.textPrimary.withValues(alpha: 0.5),
          ),
          const SizedBox(height: 12),
          Text('No Documents Uploaded', style: AppTextStyles.fieldLabel),
          const SizedBox(height: 6),
          Text(
            'Your uploaded documents will appear here.',
            textAlign: TextAlign.center,
            style: AppTextStyles.bodySmall,
          ),
        ],
      ),
    );
  }
}
