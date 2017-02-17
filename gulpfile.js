'use strict';

var argv = require('yargs')
                .usage('Usage: $0 -o [file] -g [globals] task')
                .demand(['o'])
                .describe('o', 'Output file')
                .argv;
                
var gulp = require('gulp');
var del = require('del');
var util = require('gulp-util');
var rollup = require('rollup-stream'); 
var uglify = require('gulp-uglify');
var browserSync = require('browser-sync').create();
var nodeResolve = require('rollup-plugin-node-resolve');
var sourcemaps = require('gulp-sourcemaps');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var rename = require('gulp-rename');
var commonjs = require('rollup-plugin-commonjs');
var json = require('rollup-plugin-json');
var babel = require('rollup-plugin-babel');
var string = require('rollup-plugin-string');

var outputFilename = argv.o;
var globals = [];
if (argv.g) {
    globals = Array.isArray(argv.g) ? argv.g : [ argv.g ]
}

var skips = [ ];

var globalMap = {};
globals.forEach((d) => {
    var target = null;
    if (d.indexOf('d3-') === 0) {
        target = 'd3';
        skips.push(d);
    } else {
        throw new Error('Unknown global type: ' + d);
    }

    globalMap[d] = target;
});

var task = {};

gulp.task('clean', () => del([ 'distribution/**' ]));  

gulp.task('umd', task.umd = () => {  
  return rollup({
            moduleName: outputFilename.replace(/-/g, '_'),
            globals: globalMap,
            entry: 'index.js',
            format: 'umd',
            sourceMap: true,
            plugins: [ 
                        json({
                            include: [ '**/package.json', 'tiles/*.json', 'node_modules/**/*.json' ], 
                            exclude: [  ]
                        }),
                        string({
                            include: '**/*.glsl'
                        }),
                        nodeResolve({
                            skip: skips,
                            // use "jsnext:main" if possible
                            // – see https://github.com/rollup/rollup/wiki/jsnext:main
                            jsnext: true,  // Default: false

                            // use "main" field or index.js, even if it's not an ES6 module
                            // (needs to be converted from CommonJS to ES6
                            // – see https://github.com/rollup/rollup-plugin-commonjs
                            main: true,  // Default: true

                            // not all files you want to resolve are .js files
                            extensions: [ '.js' ],  // Default: ['.js']

                            // whether to prefer built-in modules (e.g. `fs`, `path`) or
                            // local ones with the same names
                            preferBuiltins: false  // Default: true
                        }),
                        commonjs(), 
                        babel({
                            exclude: ['node_modules/**', 'tiles/**']
                        }) 
                        ]
        })
        .pipe(source('index.js', './src'))
        .pipe(buffer())
        .pipe(sourcemaps.init({ loadMaps: true }))
        .pipe(rename({basename: outputFilename}))
        .pipe(rename({suffix: '.umd-es2015'}))
        .pipe(gulp.dest('distribution/'))
        .pipe(uglify())
        .pipe(rename({suffix: '.min'}))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('distribution/'));
});

gulp.task('browser-sync', function() {
    browserSync.init({
        server: {
            baseDir: [ './examples', './distribution', './tiles' ],
            directory: true
        }
    });
});

gulp.task('serve', ['default', 'browser-sync'], function() {
    gulp.watch(['./*.js', './src/*.js', './tiles/grid-lq.json'], [ 'umd' ]);
    gulp.watch('./distribution/*.js').on('change', () => browserSync.reload('*.js'));
    gulp.watch('./tiles/*.json').on('change', () => browserSync.reload('*.html'));
    gulp.watch('./examples/**/*.html').on('change', () => browserSync.reload('*.html'));
});

gulp.task('build', [ 'clean' ], task.umd);

gulp.task('default', [ 'umd' ]);