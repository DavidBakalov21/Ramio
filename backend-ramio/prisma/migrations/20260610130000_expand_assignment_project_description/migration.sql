-- Expand assignment and project descriptions to support long-form briefs.
ALTER TABLE `Assignment` MODIFY `description` LONGTEXT NULL;
ALTER TABLE `Project` MODIFY `description` LONGTEXT NULL;
