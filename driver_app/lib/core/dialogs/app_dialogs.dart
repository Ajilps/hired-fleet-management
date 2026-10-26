import 'package:driver_app/core/dialogs/document_picker/document_picker_dialog.dart';
import 'package:driver_app/core/enum/document_source.dart';
import 'package:flutter/material.dart';
class AppDialogs {
  static Future<DocumentSource?> showDocumentPicker(
    BuildContext context, {
    required String title,
    required String subtitle,
    required List<Widget> options,
  }) {
    return showDialog<DocumentSource>(
      context: context,
      builder: (context) => DocumentPickerDialog(
        title: title,
        subtitle: subtitle,
        options: options,
      ),
    );
  }
}