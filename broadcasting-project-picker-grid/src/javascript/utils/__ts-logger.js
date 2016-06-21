/*
 */
Ext.define('Rally.technicalservices.Logger',{
    constructor: function(config){
        Ext.apply(this,config);
    },
    log: function(args){
        var timestamp = "[ " + Ext.util.Format.date(new Date(), "Y-m-d H:i:s.u") + " ]";
        var name = Rally.getApp().integrationHeaders && Rally.getApp().integrationHeaders.name;
        
        //var output_args = arguments;
        //output_args.unshift( [ "[ " + timestamp + " ]" ] );
        //output_args = Ext.Array.push(output_args,arguments);
        
        var output_args = [];
        output_args = Ext.Array.push(output_args,[timestamp]);
        if ( name ) {
            name = '<' + name + '>';
            output_args = Ext.Array.push(output_args,[name]);
        }
        output_args = Ext.Array.push(output_args, Ext.Array.slice(arguments,0));

        window.console && console.log.apply(console,output_args);
    }

});
