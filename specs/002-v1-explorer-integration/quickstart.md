# Quickstart: V1 Engine Explorer Integration

1. Build Caseworkbench:

   ```powershell
   cd web
   npm.cmd run build
   npm.cmd run pack
   ```

2. Open `release/pbgc-workbench.html` via `file://`.

3. Complete and save PlanMetadata.

4. Open `#/v1-engine-explorer`.

5. Upload approved V1 summary JSON files from `reference/raw-approved-v1-engines` in the parent Caseworkbench controls.

6. Click `Import Approved V1`.

7. Upload R5 summary JSON files for the current case.

8. Click `Load R5`, then `Rank V1 Candidates`.

9. Review:

   - best-fit V1 candidate
   - similarity/confidence/completeness
   - warnings
   - evidence
   - manifest hashes

10. Download import and ranking manifests as needed.

11. `#/v1-builder` is a compatibility alias for `#/v1-engine-explorer`.

12. Confirm packed release has no external runtime references:

   ```powershell
   rg 'src="https?://|href="https?://|src="/assets|href="/assets' release\pbgc-workbench.html
   ```
