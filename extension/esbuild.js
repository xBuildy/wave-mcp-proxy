const esbuild = require('esbuild');

const args = process.argv.slice(2);
const watch = args.includes('--watch');

async function main() {
    const context = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        outfile: 'dist/extension.js',
        external: ['vscode'],
        format: 'cjs',
        platform: 'node',
        sourcemap: true,
        minify: !watch,
    });

    if (watch) {
        await context.watch();
        console.log('watching...');
    } else {
        await context.rebuild();
        console.log('build completed successfully.');
        await context.dispose();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});